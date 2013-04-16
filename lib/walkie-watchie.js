"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");
var watch = require ("./watch");

var LINUX = process.platform === "linux";

module.exports = function (p, args){
	var watcher = new Watcher (args);
	process.nextTick (function (){
		watcher._watch (p);
	});
	return watcher;
};

var beginsWith = function (str, beginning){
	return str.lastIndexOf (beginning, 0) === 0;
};

var endsWith = function (str, ending){
	return str.indexOf (ending, str.length - ending.length) !== -1;
};

var defaultFilter = function (basename){
	var include =
			//.DS_Store
			basename !== ".DS_Store" &&
			
			//gedit
			!beginsWith (basename, ".goutputstream-") &&
			
			//vim
			!endsWith (basename, ".swp") && !endsWith (basename, ".swx") &&
			!endsWith (basename, "~") && isNaN (basename);
	
	return include;
};

var Watcher = function (args){
	events.EventEmitter.call (this);
	args = args || {};
	var noDefault = args.defaultFilter === null;
	this._filter = function (p, b, cb){
		if (!noDefault && !defaultFilter (b)){
			cb (false);
		}else if (args.filter){
			args.filter (p, b, cb);
		}else{
			cb (true);
		}
	};
	this._renameDelay = args.renameDelay;
	this._changeDelay = args.changeDelay;
	this._watchers = {};
	this._filesWatched = 0;
	this._directoriesWatched = 0;
	this._tree = {};
	this._watching = false;
	this._shared = {};
};

util.inherits (Watcher, events.EventEmitter);

Watcher.prototype._listen = function (watcher){
	watcher.on ("error", function (error){
		me.unwatch ();
		me.emit ("error", error);
	});
	
	var me = this;
	
	watcher.on ("create", function (p, stats){
		me._watch (p, true);
	});
	
	watcher.on ("delete", function (p, isDir){
		me._filter (p, path.basename (p), function (add){
			if (!add) return;
			
			if (isDir){
				me._watchers[p].unwatch ();
				delete me._watchers[p];
				me._directoriesWatched--;
			}else{
				me._filesWatched--;
			}
			
			//On Linux subdirectories doesn't emit a delete event
			//Theirs watchers are not closed and the number of total files and
			//directories are not updated
			if (LINUX) me._unwatch (p);
			
			//If all the directories and files have been deleted unwatch root
			if (!me._filesWatched && !me._directoriesWatched){
				me.unwatch ();
			}
			
			me.emit ("delete", p, isDir);
			me.emit ("any");
		});
	});
	
	watcher.on ("change", function (p){
		me._filter (p, path.basename (p), function (add){
			if (!add) return;
			
			me.emit ("change", p);
			me.emit ("any");
		});
	});
	
	watcher.on ("move", function (oldPath, newPath, isDir){
		me._filter (newPath, path.basename (newPath), function (add){
			if (!add) return;
			
			me.emit ("move", oldPath, newPath, isDir);
			me.emit ("any");
		});
	});
	
	watcher.watch ();
};

Watcher.prototype._watchDirectory = function (p, args){
	var watcher = watch (p, {
		entries: args.entries,
		root: args.root,
		shared: this._shared,
		renameDelay: this._renameDelay,
		changeDelay: this._changeDelay
	});
	this._listen (watcher);
	this._watchers[p] = watcher;
	if (args.increment && !args.root) this._directoriesWatched++;
};

Watcher.prototype._watchFile = function (p, args){
	if (args.increment) this._filesWatched++;
};

var arrayToObject = function (array){
	var o = {};
	array.forEach (function (e){
		o[e] = { isDir: null };
	});
	return o;
};

Watcher.prototype._watchRoot = function (p, isDir, cb){
	p = path.resolve (p);
	var dir = path.dirname (p);
	var me = this;
	fs.readdir (dir, function (error, entries){
		if (error) return cb (error);
		me._watchDirectory (path.relative (path.resolve ("."), dir) || ".",
				{
					entries: arrayToObject (entries),
					root: {
						entry: path.basename (p),
						isDir: isDir
					}
				});
		cb ();
	});
};

Watcher.prototype._watch = function (p, emitCreate){
	var next = function (p, h, cb){
		var exit = function (error){
			errors = errors.concat (error);
			cb ();
		};
		
		p = path.normalize (p);
		
		var fileNext = function (){
			h[path.basename (p)] = null;
			me._watchFile (p, { increment: !emitCreate });
			cb (false);
		};
		
		var dirNext = function (){
			fs.readdir (p, function (error, entries){
				if (error) return exit (error);
				
				var basename = path.basename (p);
				h[basename] = {};
				
				var remaining = entries.length;
				if (!remaining){
					me._watchDirectory (p, { entries: {}, increment: !emitCreate });
					cb (true);
					return;
				}
				
				var o = {};
				
				entries.forEach (function (entry){
						watch (p + "/" + entry, h[basename], function (isDir){
							o[entry] = { isDir: isDir };
							
							if (!--remaining){
								me._watchDirectory (p, { entries: o, increment: !emitCreate });
								cb (true);
							}
						});
				});
			});
		};
		
		fs.lstat (p, function (error, stats){
			if (error) return exit (error);
			
			if (stats.isDirectory ()){
				if (first){
					first = false;
					me._watchRoot (p, true, function (error){
						if (error) return exit (error);
						dirNext ();
					});
				}else{
					if (emitCreate){
						me._directoriesWatched++;
						me.emit ("create", p, stats);
						me.emit ("any");
					}
					dirNext ();
				}
			}else{
				if (first){
					me._watchRoot (p, false, function (error){
						if (error) return exit (error);
						fileNext ();
					});
				}else{
					if (emitCreate){
						me._filesWatched++;
						me.emit ("create", p, stats);
						me.emit ("any");
					}
					fileNext ();
				}
			}
		});
	};

	var watch = function (p, h, cb){
		me._filter (p, path.basename (p), function (add){
			if (!add) return cb ();
			next (p, h, cb);
		});
	};
	
	var errors = [];
	var me = this;
	var first = !emitCreate;
	
	if (!Array.isArray (p)){
		p = [p];
	}
	
	var len = p.length;
	var i = 0;
	
	(function each (){
		if (i < len){
			watch (p[i], me._tree, function (){
				if (!errors.length){
					i++;
					each ();
					return;
				}
				if (errors.length === 1){
					errors = errors[0];
				}
				
				me.unwatch ();
				me.emit ("error", errors);
			});
		}else{
			if (me._watching) return;
			me._watching = true;
			me.emit ("watching");
		}
	})();
};

Watcher.prototype._unwatch = function (dir){
	var deletedFiles = 0;
	var deletedDirectories = 0;
	
	for (var p in this._watchers){
		if (!beginsWith (p, dir) || p === dir) continue;
		
		deletedDirectories++;
		deletedFiles += this._watchers[p]._keys.length;
		this._watchers[p].unwatch ();
		delete this._watchers[p];
	}
	
	this._filesWatched -= deletedFiles;
	this._directoriesWatched -= deletedDirectories;
};

Watcher.prototype.unwatch = function (){
	this._tree = {};
	this._filesWatched = 0;
	
	for (var p in this._watchers){
		this._watchers[p].unwatch ();
	}
	this._watchers = {};
	this._directoriesWatched = 0;
};

Watcher.prototype.directories = function (){
	return this._directoriesWatched;
};

Watcher.prototype.files = function (){
	return this._filesWatched;
};

Watcher.prototype.tree = function (){
	return this._tree;
};
