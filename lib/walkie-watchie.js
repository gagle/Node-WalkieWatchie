"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");
var watch = require ("./watch");

module.exports = function (p, args){
	var watcher = new Watcher (args);
	process.nextTick (function (){
		watcher._watch (p);
	});
	return watcher;
};

var Watcher = function (args){
	events.EventEmitter.call (this);
	args = args || {};
	this._filter = args.filter || function (p, f, cb){ cb (true); };
	this._unwatchOnError = args.unwatchOnError === undefined
			? true
			: !!args.unwatchOnError;
	this._watchers = {};
	this._filesWatched = 0;
	this._directoriesWatched = 0;
	this._tree = {};
};

util.inherits (Watcher, events.EventEmitter);

Watcher.prototype._listen = function (watcher){
	watcher.on ("error", function (error){
		if (me._unwatchOnError) me.unwatch ();
		me.emit ("error", error);
	});
	
	var me = this;
	
	watcher.on ("create", function (p, stats){
		me._watch (p, true);
	});
	
	watcher.on ("delete", function (p, isDir){
		if (isDir){
			delete me._watchers[p];
			me._directoriesWatched--;
		}else{
			me._filesWatched--;
		}
		me.emit ("delete", p, isDir);
		me.emit ("any");
	});
	
	watcher.on ("modify", function (p){
		me.emit ("modify", p);
		me.emit ("any");
	});
	
	watcher.watch ();
};

Watcher.prototype._watchDirectory = function (p, args){
	var watcher = watch (p, args.entries, args.root, args.rootIsDir);
	this._listen (watcher);
	this._watchers[p] = watcher;
	if (!args.increment && !args.root) this._directoriesWatched++;
};

Watcher.prototype._watchFile = function (p){
	this._filesWatched++;
};

var arrayToObject = function (array){
	var o = {};
	array.forEach (function (e){
		o[e] = null;
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
					root: path.basename (p),
					rootIsDir: isDir
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
			me._watchFile (p);
			cb (false);
		};
		
		var dirNext = function (){
			fs.readdir (p, function (error, entries){
				if (error) return exit (error);
				
				var basename = path.basename (p);
				h[basename] = {};
				
				var remaining = entries.length;
				if (!remaining){
					me._watchDirectory (p, { entries: {}, increment: emitCreate });
					cb (true);
					return;
				}
				
				var o = {};
				
				entries.forEach (function (entry){
						watch (p + "/" + entry, h[basename], function (isDir){
							o[entry] = isDir;
							
							if (!--remaining){
								me._watchDirectory (p, { entries: o, increment: emitCreate });
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
				
				if (me._unwatchOnError) me.unwatch ();
				me.emit ("error", errors);
			});
		}else{
			me.emit ("watching");
		}
	})();
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