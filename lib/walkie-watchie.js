"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");
var ep = require ("error-provider");

ep.create (ep.next (), "WATCH_RARE", "Rare error watching files");

var TIMEOUT = 50;

var arrayToObject = function (array){
	var o = {};
	array.forEach (function (e){
		o[e] = null;
	});
	return o;
};

module.exports = function (p, args, filter){
	if (arguments.length === 2 && typeof args === "function"){
		filter = args;
		args = null;
	}
	var watcher = new Watcher (p, args, filter);
	//Allow event handlers to be attached before listening for changes
	process.nextTick (function (){
		watcher._watch ();
	});
	return watcher;
};

var Watcher = function (p, args, filter){
	events.EventEmitter.call (this);
	args = args || {};
	this._path = p;
	this._timeout = args.timeout || TIMEOUT;
	this._filter = filter || function (p, f, cb){ cb (true); };
	this._fileWatchers = {};
	this._directoryWatchers = {};
	this._stat = args.followLinks ? fs.stat : fs.lstat;
	this._immediate = null;
	this._dirname = null;
	this._timer = null;
	this._op = null;
};

util.inherits (Watcher, events.EventEmitter);

Watcher.prototype._task = function (fn, op, dirname, filename){
	var me = this;
	
	var reset = function (){
		me._timer = null;
		me._dirname = null;
		me._immediate = null;
		me._op = null;
	};
	
	//A timeout is needed to remember the last dirname
	if (this._timer && this._op !== op &&
			filename.indexOf (this._dirname) !== -1){
		return reset ();
	}
	
	fn ();
	
	this._dirname = dirname;
	this._op = op;
	if (this._timer){
		reset ();
		clearTimeout (this._timer);
	}
	this._timer = setTimeout (reset, me._timeout);
	
	//An immediate is needed because consecutive change events are emitted from
	//differents operations
	this._immediate = setImmediate (function (){
		me._immediate = null;
	});
};

var deletedEntry = function (all, current){
	for (var p in all){
		if (!(p in current)) return p;
	}
	//Should never execute
	return null;
};

Watcher.prototype._watchDirectory = function (p, entries, parent){
	var watcher = fs.watch (p);
	p = path.normalize (p);
	if (parent) parent._entries[path.basename (p)] = false;
	watcher._entries = arrayToObject (entries);
	var me = this;
	
	watcher.on ("error", function (error){
		//If EPERM, the watched directory has been removed, e.g. a/b, watch("a"),
		//delete b. Ignore it.
		if (error.code !== "EPERM"){
			me.emit ("error", error);
		}
	});
	
	watcher.on ("change", function (event, entry){
		if (event === "rename"){
			//Warning! The entry parameter is not guaranteed
			if (me._immediate) return;
			me._immediate = true;
				
			if (entry){
				//File and directory creation
				entry = path.join (p, entry);
				me._stat (entry, function (error, stats){
					if (error) return me.emit ("error", error);
					
					me._task (function (){
						if (stats.isDirectory ()){
							me._watch (entry, watcher);
							me.emit ("create", entry, true);
							me.emit ("any");
						}else{
							me._watchFile (entry, watcher);
							me.emit ("create", entry, false);
							me.emit ("any");
						}
					}, "create", path.dirname (p), p);
				});
			}else{
				//File and directory deletion
				me._task (function (){
					fs.readdir (p, function (error, entries){
						if (error) return me.emit ("error", error);
						
						entries = arrayToObject (entries);
						var deleted = deletedEntry (watcher._entries, entries);
						if (!deleted) return me.emit ("error", ep.get ("WATCH_RARE"));
						
						var dir = path.join (p, deleted);
						
						if (!watcher._entries[deleted]){
							me.emit ("delete", dir, true);
							me.emit ("any");
						}
						
						delete watcher._entries[deleted];
					});
				}, "delete", path.dirname (p), p);
			}
		}
	});
	
	this._directoryWatchers[p] = watcher;
};

Watcher.prototype._watchFile = function (p, parent){
	var watcher = fs.watch (p);
	p = path.normalize (p);
	var basename = path.basename (p);
	var dirname = path.dirname (p);
	if (parent) parent._entries[basename] = true;
	var me = this;
	
	var change = function (){
		me._task (function (){
			me.emit ("change", p);
			me.emit ("any");
		}, "change", dirname, p);
	};
	
	var del = function (){
		me._task (function (){
			watcher.close ();
			delete me._fileWatchers[p];
			//Check if there's no more file watchers and unwatch directories in order
			if (!me.watched ()){
				me._unwatchDirectories ();
			}
			me.emit ("delete", p);
			me.emit ("any");
		}, "delete", dirname, p);
	};
	
	watcher.on ("error", function (error){
		me.emit ("error", error);
	});
	
	watcher.on ("change", function (event){
		//The filename parameter is ignored because it is not guaranteed and can be
		//null
		if (me._immediate) return;
		me._immediate = true;
		
		if (event === "rename"){
			//Delete or rename
			//Rename is delete + create
			fs.exists (p, function (exists){
				if (!exists){
					del ();
				}else{
					me._immediate = null;
				}
			});
		}else if (event === "change"){
			//Change or delete (if its directory is removed)
			//Check if is a change or a deletion
			fs.exists (path.dirname (p), function (exists){
				exists ? change () : del ();
			});
		}
	});
	
	this._fileWatchers[p] = watcher;
};

Watcher.prototype._watch = function (p, parent){
	var next = function (p, parent, cb){
		var exit = function (error){
			errors = errors.concat (error);
			cb ();
		};
		
		me._stat (p, function (error, stats){
			if (error) return exit (error);
			
			if (stats.isDirectory ()){
				fs.readdir (p, function (error, entries){
					if (error) return exit (error);
					
					me._watchDirectory (p, entries, parent);
					
					var remaining = entries.length;
					if (!remaining) return cb ();
					
					entries.forEach (function (entry){
						watch (p + "/" + entry, parent, function (){
							if (!--remaining) cb ();
						});
					});
				});
			}else{
				me._watchFile (p, parent);
				cb ();
			}
		});
	};

	var watch = function (p, parent, cb){
		me._filter (p, path.basename (p), function (add){
			if (!add) return cb ();
			next (p, parent, cb);
		});
	};
	
	var errors = [];
	var me = this;
	
	watch (p || this._path, parent, function (){
		if (!errors.length) return;
		if (errors.length === 1){
			errors = errors[0];
		}
		me.emit ("error", errors);
	});
};

Watcher.prototype._unwatchDirectories = function (){
	for (var p in this._directoryWatchers){
		this._directoryWatchers[p].close ();
	}
	this._directoryWatchers = {};
};

Watcher.prototype.unwatch = function (){
	for (var p in this._fileWatchers){
		this._fileWatchers[p].close ();
	}
	this._fileWatchers = {};
	this._unwatchDirectories ();
};

Watcher.prototype.watched = function (){
	return Object.keys (this._fileWatchers).length;
};