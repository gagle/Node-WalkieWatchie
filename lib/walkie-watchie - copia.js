"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");
var ep = require ("error-provider");

ep.create (ep.next (), "WATCH_RARE", "Something went wrong watching the " +
		"files/directories");

var TIMEOUT = 100;

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
	this._path = p;
	this._args = args || {};
	this._args.timeout = this._args.timeout || TIMEOUT;
	this._filter = filter || function (p, f, cb){ cb (true); };
	this._watchers = [];
};

util.inherits (Watcher, events.EventEmitter);

Watcher.prototype._create = function (watcher, entry){
	var stat = this._args.followLinks ? fs.stat : fs.lstat;
	var me = this;
	var p = watcher._path + "/" + entry;
	
	stat (p, function (error, stats){
		if (error) return me.emit ("error", error);
		
		watcher._watching[entry] = stats.isDirectory ()
				? me._watchDirectory (p)
				: me._watchFile (p);
		watcher._watching[entry]._first = true;
		me.emit ("create", path.normalize (p), stats);
		me.emit ("any");
	});
};

var unwatch = function (watcher){
	watcher.close ();
	for (var p in watcher._watching){
		unwatch (watcher._watching[p]);
	}
};

var deletedEntry = function (all, current){
/*console.log("all")
console.log(all)
console.log("current")
console.log(current)*/
	for (var p in all){
		if (!(p in current)) return p;
	}
	return null;
};

Watcher.prototype._deleteDirectory = function (watcher, firstFile){
	if (firstFile){
		watcher.close ();
		this.emit ("delete", path.join (watcher._path, firstFile));
		this.emit ("any");
		return;
	}
	
	if (watcher._first){
		watcher.close ();
		this.emit ("delete", watcher._path);
		this.emit ("any");
		return;
	}
	
	var me = this;
	fs.readdir (watcher._path, function (error, entries){
		if (error) return me.emit ("error", error);
		
		//Unwatch subfiles and subdirectories
		var deleted = deletedEntry (watcher._watching, arrayToObject (entries));
		if (!deleted){
			return me.emit (ep.get ("WATCH_RARE"));
		}console.log("deleted", deleted)

		unwatch (watcher._watching[deleted]);
		delete watcher._watching[deleted];
		me.emit ("delete", path.join (watcher._path, deleted));
		me.emit ("any");
	});
};

Watcher.prototype._watchFile = function (p){
console.log("watching file", p)
	var watcher = fs.watch (p);
	var me = this;
	
	watcher.on ("error", function (){
		me.emit ("error", errors);
	});
	
	watcher.on ("change", function (event, filename){
	console.log("file", event, filename)
		
	});
	
	this._watchers.push (watcher);
	return watcher;
};

Watcher.prototype._watchDirectory = function (p, firstFile){
console.log("watching dir", p)
	var watcher = fs.watch (p);
	var me = this;
	
	watcher._path = p;
	watcher._watching = {};
	
	watcher.on ("error", function (error){
		//If EPERM, the watched directory has been removed, e.g. a/b, watch("a"),
		//delete b
		//Ignore the error because the parent watcher is already watching the
		//directory
		//If the watched directory is removed, unwatch it, e.g. watch("a"), delete a
		if (error.code === "EPERM"){console.log("eperm", watcher._path)
			me._deleteDirectory (watcher);
			return;
		}
		me.emit ("error", error);
	});
	
	watcher.on ("change", function (event, entry){
		console.log("dir", event, entry)
		if (event === "rename"){
			//Creation and deletion
			//When it's renamed 2 consecutive events are fired meaning
			//deletion + creation
			//Pure rename events cannot be emitted without a timer
			if (entry){
				me._create (watcher, entry);
			}else{
				me._deleteDirectory (watcher, firstFile);
			}
		}
		//Event: change
		//Subfiles and subdirectories, creations and deletions, from the directory
		//being watched. Ignore it because these files and directories are already
		//being watched by their watchers.
	});
	
	me._watchers.push (watcher);
	return watcher;
};

Watcher.prototype._watch = function (){
	var stat = this._args.followLinks ? fs.stat : fs.lstat;
	
	var next = function (p, basename, parentWatcher, cb){
		var exit = function (error){
			errors = errors.concat (error);
			cb ();
		};
		
		stat (p, function (error, stats){
			if (error) return exit (error);
			
			if (stats.isDirectory ()){
				var watcher = me._watchDirectory (p);
				watcher._first = first;
				first = false;
				watcher._parent = parentWatcher;
				if (parentWatcher){
					parentWatcher._watching[basename] = watcher;
				}
				
				fs.readdir (p, function (error, entries){
					if (error) return exit (error);
					
					var remaining = entries.length;
					if (!remaining) return cb ();
					
					entries.forEach (function (entry){					
						watch (p + "/" + entry, watcher, function (){
							if (!--remaining) cb ();
						});
					});
				});
			}else{
				if (first){
					me._watchDirectory (path.dirname (p), p);
				}else{
					var watcher = me._watchFile (p);
					watcher._parent = parentWatcher;
					parentWatcher._watching[basename] = watcher;
				}
				
				cb ();
			}
		});
	};

	var watch = function (p, parentWatcher, cb){
		var basename = path.basename (p);
		me._filter (p, basename, function (add){
			if (!add) return cb ();
			next (p, basename, parentWatcher, cb);
		});
	};
	
	var errors = [];
	var me = this;
	var first = true;
	
	watch (this._path, null, function (){
		if (!errors.length) return;
		if (errors.length === 1){
			errors = errors[0];
		}
		me.emit ("error", errors);
	});
};

Watcher.prototype.unwatch = function (){
	this._watchers.forEach (function (watcher){
		watcher.close ();
	});
};