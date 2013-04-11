"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");
var watch = require ("./watch");

var arrayToObject = function (array){
	var o = {};
	array.forEach (function (e){
		o[e] = null;
	});
	return o;
};

module.exports = function (p, filter){
	var watcher = new Watcher (filter);
	process.nextTick (function (){
		watcher._watch (p);
	});
	return watcher;
};

var Watcher = function (filter){
	events.EventEmitter.call (this);
	this._filter = filter || function (p, f, cb){ cb (true); };
	this._fileWatchers = {};
	this._directoryWatchers = {};
	this._filesWatched = 0;
	this._directoriesWatched = 0;
};

util.inherits (Watcher, events.EventEmitter);

Watcher.prototype._listen = function (watcher){
	watcher.on ("error", this.emit.bind (this, "error"));
	
	var me = this;
	
	watcher.on ("create", function (p, stats){
		me._watch (p, true);
	});
	watcher.on ("delete", function (p, isDir){
		if (isDir){
			delete me._directoryWatchers[p];
			me._directoriesWatched--;
		}else{
			delete me._fileWatchers[p];
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

Watcher.prototype._watchDirectory = function (p){
	p = path.normalize (p);
	var watcher = watch (p, true);
	this._listen (watcher);
	this._directoryWatchers[p] = watcher;
	this._directoriesWatched++;
};

Watcher.prototype._watchFile = function (p){
	p = path.normalize (p);
	var watcher = watch (p);
	this._listen (watcher);
	this._fileWatchers[p] = watcher;
	this._filesWatched++;
};

Watcher.prototype._watch = function (p, emitCreate){
	var next = function (p, cb){
		var exit = function (error){
			errors = errors.concat (error);
			cb ();
		};
		
		fs.stat (p, function (error, stats){
			if (error) return exit (error);
			
			if (stats.isDirectory ()){
				fs.readdir (p, function (error, entries){
					if (error) return exit (error);
					
					me._watchDirectory (p);
					if (emitCreate){
						me.emit ("create", p, stats);
						me.emit ("any");
					}
					
					var remaining = entries.length;
					if (!remaining) return cb ();
					
					entries.forEach (function (entry){
						watch (p + "/" + entry, function (){
							if (!--remaining) cb ();
						});
					});
				});
			}else{
				me._watchFile (p);
				if (emitCreate){
					me.emit ("create", p, stats);
					me.emit ("any");
				}
				cb ();
			}
		});
	};

	var watch = function (p, cb){
		me._filter (p, path.basename (p), function (add){
			if (!add) return cb ();
			next (p, cb);
		});
	};
	
	var errors = [];
	var me = this;
	
	watch (p, function (){
		if (!errors.length) return;
		if (errors.length === 1){
			errors = errors[0];
		}
		me.emit ("error", errors);
	});
};

Watcher.prototype.unwatch = function (){
	for (var p in this._fileWatchers){
		this._fileWatchers[p].unwatch ();
	}
	this._fileWatchers = {};
	this._filesWatched = 0;
	
	for (var p in this._directoryWatchers){
		this._directoryWatchers[p].unwatch ();
	}
	this._directoryWatchers = {};
	this._directoriesWatched = 0;
};

Watcher.prototype.directories = function (){
	return this._directoriesWatched;
};

Watcher.prototype.files = function (){
	return this._filesWatched;
};