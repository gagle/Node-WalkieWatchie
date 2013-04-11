"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");

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
	var watcher = new Watcher (args, filter);
	//Allow event handlers to be attached before listening for changes
	process.nextTick (function (){
		watcher._watch (p);
	});
	return watcher;
};

var Watcher = function (args, filter){
	events.EventEmitter.call (this);
	args = args || {};
	this._filter = filter || function (p, f, cb){ cb (true); };
	this._fileWatchers = {};
	this._directoryWatchers = {};
	this._stat = args.followLinks ? fs.stat : fs.lstat;
	this._lock;
	this._locked = {};
};

util.inherits (Watcher, events.EventEmitter);

Watcher.prototype._task = function (fn, args){
	var me = this;
	
	if (!args.noGlobal){
		if (!this._lock){
			this._lock = {
				op: args.op,
				dir: args.dir,
				name: args.name
			};
		}else if (this._lock.op === args.op
				&& this._lock.dir === args.dir){
			//If op's and dir's are the same and name1 is "a" and name2 is "ab" and "a"
			//emits an event, the same event is emitted by "ab". The first watcher
			//("a") is valid and the others are invalid (false positives).
			//All the invalid watchers must be saved and unlocked when the valid watcher
			//unlocks.
			this._locked[args.dir + "/" + args.name] = args.watcher;
			
			//When new files are created and they are modified, "a" events are emitted
			//after "ab" events so we must check for the minimum length
			if (args.name.length < this._lock.name.length){
				this._lock.name = args.name;
			}
			return;
		}else if ((this._lock.op === "create" || this._lock.op === "delete")
				&& args.op === "delete"){
			//False positives when a file/directory is created
			this._locked[args.dir + "/" + args.name] = args.watcher;
			return;
		}
	}
	
	this._locked[args.dir + "/" + args.name] = args.watcher;
	
	//Avoid duplicate events
	setImmediate (function (){
		//Avoid false positives when a file/directory is created
		setImmediate (function (){
			//Unlock invalid watchers
			for (var p in me._locked){
				me._locked[p]._lock = false;
			}
			me._locked = {};
			fn (me._lock);
			//Unlock global valid watcher
			me._lock = null;
		});
	});
};

var deletedEntry = function (all, current){
	for (var p in all){
		if (!(p in current)) return p;
	}
	return "";
};

Watcher.prototype._watchDirectory = function (p){
	try{
		var watcher = fs.watch (p);
	}catch (error){
		return this.emit ("error", error);
	}
	
	p = path.normalize (p);
	var dir = path.dirname (p);
	var me = this;
	
	watcher.on ("error", function (error){
		//If EPERM, the watched directory has been removed, e.g. a/b, watch("a"),
		//delete b. Ignore it.
		if (error.code !== "EPERM"){
			me.emit ("error", error);
		}
	});
	
	watcher.on ("change", function (event, entry){
		//Warning! The entry name is not guaranteed
		if (event === "rename" && entry){console.log("d",event,entry)
			//File and directory creation
			var filename = path.join (p, entry);
			me._task (function (lock){
				me._watch (filename, function (){
					me._stat (filename, function (error, stats){
						if (error) return me.emit ("error", error);
						me.emit ("create", filename, stats.isDirectory ());
						me.emit ("any");
					});
				});
			}, {
				watcher: watcher,
				op: "create",
				dir: dir,
				name: entry
			});
		}
	});
	
	this._directoryWatchers[p] = watcher;
};

Watcher.prototype._watchFile = function (p){
	try{
		var watcher = fs.watch (p);
	}catch (error){
		return this.emit ("error", error);
	}
	
	p = path.normalize (p);
	var dir = path.dirname (p);
	var name = path.basename (p);
	var me = this;
	
	var change = function (){
		me._task (function (lock){
			me.emit ("change", path.join (lock.dir, lock.name));
			me.emit ("any");
		}, {
			watcher: watcher,
			op: "change",
			dir: dir,
			name: name
		});
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
		}, {
			watcher: watcher,
			op: "delete",
			dir: dir,
			name: name,
			//noGlobal: true
		});
	};
	
	watcher.on ("error", function (error){
		me.emit ("error", error);
	});
	
	watcher.on ("change", function (event){console.log("f",event,name)
		if (watcher._lock) return;
		watcher._lock = true;
		
		if (event === "rename"){
			//Delete or rename
			//Rename is delete + create
			del ();
		}else if (event === "change"){
			//Change or delete (if its directory is removed)
			//Check if is a change or a deletion
			fs.exists (dir, function (exists){
				exists ? change () : del ();
			});
		}
	});
	
	this._fileWatchers[p] = watcher;
};

Watcher.prototype._watch = function (p, cb){
	var next = function (p, cb){
		var exit = function (error){
			errors = errors.concat (error);
			cb ();
		};
		
		me._stat (p, function (error, stats){
			if (error) return exit (error);
			
			if (stats.isDirectory ()){
				fs.readdir (p, function (error, entries){
					if (error) return exit (error);
					
					me._watchDirectory (p);
					
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
		if (!errors.length) return cb && cb ();
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