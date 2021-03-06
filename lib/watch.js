"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");

var LINUX = process.platform === "linux";
var WINDOWS = process.platform === "win32";
var OSX = process.platform === "darwin";

//Ignore EPERM errors. If the user doesn't have permissions, then files and
//directories cannot be created/deleted/changed, therefore the watcher should
//not emit anything

//Ignore ENOENT errors. Temporary files (create and delete in the same tick) can
//cause enoent errors.

module.exports = function (p, args){
	return new Wrapper (p, args);
};

var arrayIsEmpty = function (a){
	for (var i=0, len=a.length; i<len; i++){
		if (a[i] !== undefined) return false;
	}
	return true;
};

var Wrapper = function (p, args){
	events.EventEmitter.call (this);
	
	this._dir = p;
	this._entries = args.entries;
	this._keys = Object.keys (args.entries);
	this._root = args.root;
	this._watcher = null;
	this._shared = args.shared;
	this._shared.renamed = [];
	this._changeDelay = args.changeDelay;
	this._moveDelay = args.moveDelay;
};

util.inherits (Wrapper, events.EventEmitter);

Wrapper.prototype._checkDelete = function (cb){
	var len = this._keys.length;
	var i = 0;
	var me = this;
	
	(function each (){
		if (i < len){
			var entry = me._keys[i];
			fs.exists (me._dir + "/" + entry, function (exists){
				//If not exists, the entry has been deleted
				
				//Because multiple delete events can occur in the same loop tick
				//the entry must be removed leaving an empty gap in the array of entries
				//to check if a second entry has already been deleted
				//For example, if ./a and ./b are deleted in the same tick, at this
				//point we have 2 events: "./a doesn't exist", and "./a doesn't exist",
				//when in fact, the second event should be "./b doesn't exist"
				if (!exists && me._keys[i]){
					//The element has to be "deleted" instead of "spliced", the empty gap
					//produced by the "delete" is needed
					delete me._keys[i];
					cb (entry);
				}else{
					i++;
					each ();
				}
			});
		}else{
			cb ();
		}
	})();
};

Wrapper.prototype._checkCreate = function (entries, cb){
	for (var i=0, len=entries.length; i<len; i++){
		//If not exists, the entry has been created
		if (!(entries[i] in this._entries)){
			return entries[i];
		}
	}
};

Wrapper.prototype._delete = function (entry){
	if (this._root && this._root.entry !== entry) return;
	
	var p = path.join (this._dir, entry);
	var isDir = this._root ? this._root.isDir : this._entries[entry].isDir;
	
	if (!this._root){
		delete this._entries[entry];
		if (arrayIsEmpty (this._keys)){
			//Clean array
			this._keys = [];
		}
	}
	
	if (this._moveDelay){
		//Postpone the delete event to check if the entry has been renamed
		var me = this;
		this._shared.renamed.push ({ entry: entry, path: p });
		
		setTimeout (function (){
			for (var i=0, len=me._shared.renamed.length; i<len; i++){
				if (me._shared.renamed[i].entry === entry){
					me._shared.renamed.splice (i, 1);
					me.emit ("delete", p, isDir, !!me._root);
					return;
				}
			}
		}, this._moveDelay);
	}else{
		this.emit ("delete", p, isDir, !!this._root);
	}
};

Wrapper.prototype._create = function (entry){
	var p = path.join (this._dir, entry);
	var me = this;
	
	if (this._moveDelay){
		//Postpone the create event to check if the entry has been renamed
		
		//When a move event occurs fs.watch() first returns that an entry has been
		//deleted and then that an entry has been created, but because some
		//asynchronous checks must be done, sometimes a create event comes first,
		//therefore the create event must be postponed
		
		var o = { entry: entry, path: p };
		this._shared.renamed.push (o);
		this._shared.create = true;
		
		var e = {};
		this._entries[entry] = e;
		this._keys.push (entry);
		
		fs.lstat (p, function (error, stats){
			if (error){
				if (error.code === "EPERM" || error.code === "ENOENT") return;
				return me.emit ("error", error);
			}
			
			o.stats = stats;
			e.isDir = stats.isDirectory ();
		
			setTimeout (function (){
				for (var i=0, len=me._shared.renamed.length; i<len; i++){
					if (me._shared.renamed[i].entry === entry){
						me._shared.renamed.splice (i, 1);
						
						me.emit ("create", p);
						return;
					}
				}
			}, me._moveDelay);
		});
	}else{
		fs.lstat (p, function (error, stats){
			if (error){
				if (error.code === "EPERM" || error.code === "ENOENT") return;
				return me.emit ("error", error);
			}
			
			me._entries[entry] = { isDir: stats.isDirectory () };
			me._keys.push (entry);
			
			me.emit ("create", p);
		});
	}
};

Wrapper.prototype._change = function (entry){
	if (this._entries[entry]){
		if (this._changeDelay){
			var me = this;
			this._entries[entry].lock = setTimeout (function (){
				//The file could have been deleted
				if (me._entries[entry]){
					me._entries[entry].lock = null;
				}
			}, this._changeDelay);
		}else{
			this._entries[entry].lock = false;
		}
	}
	
	//If !this._entries[entry]
	//The entry has been created, changed, deleted very quickly
	//A file change is detected in the next tick, therefore the delete event
	//is emitted before the change event
	//This scenario is not usual and it's probably due to temporary files
	//A change event is emitted even after the delete
	
	this.emit ("change", path.join (this._dir, entry));
};

Wrapper.prototype._move = function (entry){
	var p = path.join (this._dir, entry);
	var me = this;
	
	var emit = function (stats){
		if (!me._shared.renamed.length) return;
		var o = me._shared.renamed.shift ();
		var createThenDelete = !stats;
		if (createThenDelete) stats = o.stats;
		
		if (createThenDelete){
			if (!me._root){
				delete me._entries[entry];
				if (arrayIsEmpty (me._keys)){
					//Clean array
					me._keys = [];
				}
			}
		}else{
			me._entries[entry] = { isDir: stats.isDirectory () };
			me._keys.push (entry);
		}
		
		var oldPath = createThenDelete ? p : o.path;
		var newPath = createThenDelete ? o.path : p;
		me.emit ("move", oldPath, newPath, stats.isDirectory ());
	};
	
	fs.lstat (p, function (error, stats){
		if (error && error.code === "EPERM") return;
		if (error && error.code === "ENOENT") return emit ();
		if (error) return me.emit ("error", error);
		
		emit (stats);
	});
};

Wrapper.prototype._createDeleteRename = function (rawEntry){
	var me = this;
	
	//Read current entries and compare with the previous entries
	fs.readdir (this._dir, function (error, entries){
		if (error){
			if (error.code === "EPERM") return;
			if (error.code === "ENOENT") return;
			return me.emit ("error", error);
		}
		
		me._checkDelete (function (entry){
			if (entry){
				if (me._shared.create && me._shared.renamed.length){
					me._shared.create = false;
					return me._move (entry);
				}
				
				if (!me._entries[entry]){
					//The entry has been renamed inside the same dir, e.g.: a/b -> a/c,
					//or a file has been replaced
					entry = me._checkCreate (entries);
					if (me._moveDelay){
						if (entry){
							me._move (entry);
						}else if (LINUX){
							me._change (rawEntry);
						}
					}else{
						if (entry){
							me._create (entry);
						}else if (LINUX){
							me._change (rawEntry);
						}
					}
				}else{
					me._delete (entry);
				}
			}else{
				var entry = me._checkCreate (entries);
				if (entry){
					if (me._moveDelay && me._shared.renamed.length){
						me._move (entry);
					}else{
						me._create (entry);
					}
				}else{
					//If it's not a delete nor a create and the event is a rename, assume
					//that is a change
					//Gedit and vim execute this
					me._change (rawEntry);
				}
			}
		});
	});
};

Wrapper.prototype.unwatch = function (){
	if (!this._watcher) return;
	this._watcher.close ();
	this._watcher = null;
};

Wrapper.prototype.watch = function (){
	if (this._watcher) return;
	
	var me = this;
	
	try{
		this._watcher = fs.watch (this._dir);
	}catch (error){
		return this.emit ("error", error);
	}
	
	this._watcher.on ("error", function (error){
		//EPERM is emitted on Windows when a watched directory is deleted
		if (error.code === "EPERM") return;
		me.emit ("error", error);
	});
	
	this._watcher.on ("change", function (event, entry){
		if (event === "rename"){
			//Ignore events in the root directory
			if (me._root && entry && me._root.entry !== entry) return;
			
			me._createDeleteRename (entry);
		}else if (event === "change"){
			//Ignore events in the root directory
			if (me._root && (me._root.entry !== entry ||
					(me._root.entry === entry && me._root.isDir))) return;
			
			//If the entry doesn't exist, the file/directory has been renamed, it can
			//be ignored
			//rename = delete + create + change
			if (!me._entries[entry]) return;
			
			//Directory change events are ignored
			if (me._entries[entry].isDir) return;
			
			//Lock because only one change event is needed when the directory is
			//deleted and to avoid duplicate change events when a file is modified
			if (me._entries[entry].lock) return;
			me._entries[entry].lock = true;
			
			//On Windows if a directory is deleted a change event is emitted for each
			//entry in the directory. Ignore these events, only the directory delete
			//event is necessary
			fs.exists (me._dir, function (exists){
				if (exists){
					//File modified
					me._change (entry);
				}
			});
		}
	});
};
