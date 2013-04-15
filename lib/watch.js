"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");

var RENAME_MS = 10;

module.exports = function (p, args){
	return new Wrapper (p, args);
};

var Wrapper = function (p, args){
	events.EventEmitter.call (this);
	this._dir = p;
	this._entries = args.entries;
	this._keys = Object.keys (args.entries);
	this._root = args.root;
	this._watcher = null;
	this._shared = args.shared;
	this._renameDelay = args.renameDelay || RENAME_MS;
	if (this._renameDelay === -1) this._renameDelay = null;
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
				if (!exists){
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
	var entry;
	for (var i=0, len=entries.length; i<len; i++){
		var entry = entries[i];
		//If not exists, the entry has been created
		if (!(entry in this._entries)){
			return entry;
		}
	}
};

Wrapper.prototype._delete = function (entry){
	//Ignore events in the root directory
	if (this._root && this._root.entry !== entry) return;
	
	var p = path.join (this._dir, entry);
	var isDir = this._root ? this._root.isDir : this._entries[entry].isDir;
	
	if (!this._root){
		delete this._entries[entry];
		this._keys = Object.keys (this._entries);
	}else{
		this.unwatch ();
	}
	
	if (this._renameDelay){
		//Postpone the delete event to check if the entry has been renamed
		var me = this;
		this._shared.renamed = p;
		setTimeout (function (){
			if (me._shared.renamed){
				me._shared.renamed = null;
				me.emit ("delete", p, isDir);
			}
		}, this._renameDelay);
	}else{
		this.emit ("delete", p, isDir);
	}
};

Wrapper.prototype._create = function (entry){
	//Ignore events in the root directory
	if (this._root && this._root.entry !== entry) return;
	
	var p = path.join (this._dir, entry);
	var me = this;
	
	fs.lstat (p, function (error, stats){
		if (error) return me.emit ("error", error);
		
		me._entries[entry] = { isDir: stats.isDirectory () };
		me._keys = Object.keys (me._entries);
		
		me.emit ("create", p, stats);
	});
};

Wrapper.prototype._modify = function (entry){
	this.emit ("change", path.join (this._dir, entry));
	this._entries[entry].lock = false;
};

Wrapper.prototype._rename = function (entry){
	var p = path.join (this._dir, entry);
	var me = this;
	
	fs.lstat (p, function (error, stats){
		if (error) return me.emit ("error", error);
		
		me._entries[entry] = { isDir: stats.isDirectory () };
		me._keys = Object.keys (me._entries);
		
		var old = me._shared.renamed;
		me._shared.renamed = null;
		
		me.emit ("move", old, p, stats.isDirectory ());
	});
};

Wrapper.prototype._createDeleteRename = function (){
	var me = this;
	
	//Read current entries and compare with the previous entries
	fs.readdir (this._dir, function (error, entries){
		if (error) return me.emit ("error", error);
		
		me._checkDelete (function (entry){
			if (entry){
				if (!me._entries[entry]){
					//The entry has been renamed inside the same dir, e.g.: a/b -> a/c
					entry = me._checkCreate (entries);
					if (me._renameDelay){
						if (entry){
							me._rename (entry);
						}
					}else{
						me._create (entry);
					}
				}else{
					me._delete (entry);
				}
			}else{
				var entry = me._checkCreate (entries);
				if (entry){
					if (me._renameDelay && me._shared.renamed){
						me._rename (entry);
					}else{
						me._create (entry);
					}
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
		//EPERM is emitted when a watched directory is deleted
		if (error.code === "EPERM") return me.unwatch ();
		me.emit ("error", error);
	});
	
	this._watcher.on ("change", function (event, entry){
		if (event === "rename"){
			me._createDeleteRename ();
		}else if (event === "change"){
			//Ignore events in the root directory
			if (me._root && (me._root.entry !== entry ||
					(me._root.entry === entry && me._root.isDir))) return;
			
			//If the entry doesn't exist, the file/directory has been renamed, it can
			//be ignored
			//rename = delete + create + change
			if (!me._entries[entry]) return;
			
			//Directory change evenets are ignored
			if (me._entries[entry].isDir) return;
			
			//Lock because only one change event is needed when the directory is
			//deleted and to avoid duplicate change events when a file is modified
			if (me._entries[entry].lock) return;
			me._entries[entry].lock = true;
			
			//If a directory is deleted a "change" event is emitted for every file
			fs.exists (me._dir, function (exists){
				if (exists){
					//File modified
					me._modify (entry);
				}else{
					//Directory deleted
					me._keys.forEach (me._delete.bind (me));
				}
			});
		}
	});
};