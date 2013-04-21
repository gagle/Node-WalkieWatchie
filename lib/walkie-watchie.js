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
	
	this._filesWatched = 0;
	this._directoriesWatched = 0;
	this._watchers = {};
	this._root = {
		parent: null,
		first: null
	};
	this._tree = {};
	this._dir = null;
	
	this._shared = {};
	this._watching = false;
};

util.inherits (Watcher, events.EventEmitter);

Watcher.prototype._relativePath = function (p){
	var len = this._dir.length;
	return p.substr (len ? len + 1 : len);
};

Watcher.prototype._getTreeHolder = function (p){
	p = path.dirname (p);
	var h = this._tree;
	if (p === ".") return h;
	
	p = this._relativePath (p);
	
	p.split (path.sep).forEach (function (s){
		h = h[s];
	});
	
	return h;
};

Watcher.prototype._deleteTreeHolder = function (p){
	p = this._relativePath (p);
	
	var h = this._tree;
	var o;
	var last;
	p.split (path.sep).forEach (function (s){
		o = h;
		last = s;
		h = h[s];
	});
	delete o[last];
};

Watcher.prototype._getWatchersHolder = function (p){
	p = path.dirname (p);
	var h = this._watchers;
	if (p === ".") return h;
	console.log(12313123123)
	p = this._relativePath (p);
	
	p.split (path.sep).forEach (function (s){
		h = h[s].holder;
	});
	
	return h;
};

Watcher.prototype._deleteWatchersHolder = function (p){
	//Get the holder
	var h = this._watchers;
	var o;
	var last;
	p.split (path.sep).forEach (function (s){
		o = h;
		last = s;
		h = h[s].holder;
	});
	
	var deletedFiles = 0;
	var deletedDirectories = 0;
	
	var countFiles = function (wrapper){
		var n = 0;
		for (var e in wrapper._entries){
			if (!wrapper._entries[e].isDir) n++;
		}
		return n;
	};
	
	//Unwatch childs
	var unwatch = function (h){
		for (var p in h){
			h[p].wrapper.unwatch ();
			deletedDirectories++;
			deletedFiles += countFiles (h[p].wrapper);
			unwatch (h[p].holder);
		}
	};
	unwatch (o[last].holder);
	
	//Unwatch holder
	o[last].wrapper.unwatch ();
	deletedDirectories++;
	deletedFiles += countFiles (o[last].wrapper);
	
	//Delete holder
	delete o[last];
	
	this._filesWatched -= deletedFiles;
	this._directoriesWatched -= deletedDirectories;
};

Watcher.prototype._listen = function (watcher){
	watcher.on ("error", function (error){
		me.unwatch ();
		me.emit ("error", error);
	});
	
	var me = this;
	
	watcher.on ("create", function (p, stats){
		me._watch (p, true);
	});
	
	watcher.on ("delete", function (p, isDir, isRoot){
		me._filter (p, path.basename (p), function (add){
			if (!add) return;
			
			//On Linux, when a directory is deleted its files and subdirectories don't
			//emit a delete event
			//The watchers are not closed and the number of total files and
			//directories are not updated
			//For uniformity reasons, all platforms emit a single event when a
			//directory is deleted.
			me._unwatch (p, isDir, isRoot);
			
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
	var wrapper = watch (p, {
		entries: args.entries || {},
		root: args.root,
		shared: this._shared,
		renameDelay: this._renameDelay,
		changeDelay: this._changeDelay
	});
	
	this._listen (wrapper);
	
	if (args.root){
		this._root.parent = wrapper;
		return;
	}
	
	if (args.increment) this._directoriesWatched++;
	return wrapper;
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

Watcher.prototype._watch = function (p, create){
	var next = function (p, t, w, cb){
		var exit = function (error){
			errors = errors.concat (error);
			cb ();
		};
		
		p = path.normalize (p);
		
		var fileNext = function (stats){
			if (first){
				me._tree = null;
			}else{
				t[path.basename (p)] = p;
			}
			
			if (create){
				me._filesWatched++;
				me.emit ("create", p, stats);
				me.emit ("any");
			}
			
			me._watchFile (p, { increment: !create });
			cb (false);
		};
		
		var dirNext = function (stats, first){
			fs.readdir (p, function (error, entries){
				if (error) return exit (error);
				
				if (!first){
					var basename = path.basename (p);
					t[basename] = {};
					t = t[basename];
				}
				
				if (create){
					me._directoriesWatched++;
					me.emit ("create", p, stats);
					me.emit ("any");
				}
				
				var remaining = entries.length;
				if (!remaining){
					var wrapper = me._watchDirectory (p, { increment: !create });
					if (first){
						me._root.first = wrapper;
					}else{
						w[basename] = {
							wrapper: wrapper,
							holder: {}
						};
					}
					cb (true);
					return;
				}
				
				var o = {};
				var h = first ? w : {};
				
				entries.forEach (function (entry){
					watch (p + "/" + entry, t, h, function (isDir){
						o[entry] = { isDir: isDir };
						
						if (!--remaining){
							var wrapper = me._watchDirectory (p, { entries: o,
									increment: !create });
							if (first){
								me._root.first = wrapper;
							}else{
								w[basename] = {
									wrapper: wrapper,
									holder: h
								};
							}
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
					me._dir = p === "." ? "" : p;
					me._watchRoot (p, true, function (error){
						if (error) return exit (error);
						dirNext (stats, true);
					});
				}else{
					dirNext (stats);
				}
			}else{
				if (first){
					me._watchRoot (p, false, function (error){
						if (error) return exit (error);
						fileNext (stats);
					});
				}else{
					fileNext (stats);
				}
			}
		});
	};

	var watch = function (p, t, w, cb){
		me._filter (p, path.basename (p), function (add){
			if (!add) return cb ();
			next (p, t, w, cb);
		});
	};
	
	var errors = [];
	var me = this;
	var first = !create;
	
	//If it's a dynamic creation, get the holders where the new entry must be
	//stored
	p = path.normalize (p);
	var treeHolder = create ? this._getTreeHolder (p, true) : this._tree;
	var watchersHolder = create ? this._getWatchersHolder (p) : this._watchers;
	
	watch (p, treeHolder, watchersHolder, function (){
		if (!errors.length){
			if (me._watching) return;
			me._watching = true;
			me.emit ("watching");
			return;
		}
		if (errors.length === 1){
			errors = errors[0];
		}
		me.unwatch ();
		me.emit ("error", errors);
	});
};

Watcher.prototype._unwatch = function (p, isDir, isRoot){
	if (!isDir){
		this._filesWatched--;
		this._deleteTreeHolder (p);
	}else if (isRoot){
		//The first watched directory has been deleted, unwatch all
		this.unwatch ();
	}else{
		//Update the tree
		this._deleteTreeHolder (p);
		//Unwatch and delete the watchers
		this._deleteWatchersHolder (p);
	}
};

Watcher.prototype.unwatch = function (){
	var unwatch = function (watchers){
		for (var p in watchers){console.log(p)
			watchers[p].wrapper.unwatch ();
			unwatch (watchers[p].holder);
		}
	};
	
	this._filesWatched = 0;
	this._directoriesWatched = 0;
	
	this._root.parent.unwatch ();
	this._root.first.unwatch ();
	
	unwatch (this._watchers);
	
	//Sanity check, avoid memory leaks
	this._tree = null;
	this._root = null;
	this._watchers = null;
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
