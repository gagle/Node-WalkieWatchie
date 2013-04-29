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

var beginsWith = function (str, beginning){
	return str.lastIndexOf (beginning, 0) === 0;
};

var endsWith = function (str, ending){
	return str.indexOf (ending, str.length - ending.length) !== -1;
};

var defaultFilter = function (basename){
	var include =
			//gedit
			!beginsWith (basename, ".goutputstream-") &&
			
			//vim, this should also include "isNaN(basename)" but could filter valid
			//files or directories with a name where all the characters are numbers
			!endsWith (basename, ".swp") && !endsWith (basename, ".swpx") &&
			!endsWith (basename, ".swx") && !endsWith (basename, "~");
	
	return include;
};

var Watcher = function (args){
	events.EventEmitter.call (this);
	
	args = args || {};
	var noDefault = args.defaultFilter === null;
	
	this._filter = function (p, b, cb){
		if (!noDefault){
			cb (defaultFilter (b));
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
	this._tree = null;
	this._dir = null;
	
	this._shared = {};
	this._watching = false;
};

util.inherits (Watcher, events.EventEmitter);

Watcher.prototype._relativePath = function (p){
	var len = this._dir.length;
	//len + 1 to avoid a possible last slash
	return p.substr (len ? len + 1 : len);
};

Watcher.prototype._getTreeHolder = function (p){
	p = path.dirname (p);
	var h = this._tree;
	if (p === ".") return h;
	
	p = this._relativePath (p);
	if (!p) return h;
	
	p.split (path.sep).forEach (function (s){
		h = h[s];
	});
	
	return h;
};

Watcher.prototype._deleteTreeHolder = function (p){
	var h = this._tree;
	var o;
	var last;
	this._relativePath (p).split (path.sep).forEach (function (s){
		o = h;
		last = s;
		h = h[s];
	});
	delete o[last];
};

Watcher.prototype._getWatchersHolder = function (p){
	p = path.dirname (p);
	var h = this._watchers;
	if (p === "." || p === "") return h;
	
	p = this._relativePath (p);
	if (!p) return h;
	
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
	this._relativePath (p).split (path.sep).forEach (function (s){
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
	var me = this;
	
	watcher.on ("error", function (error){
		me.unwatch ();
		me.emit ("error", error);
	});
	
	watcher.on ("create", function (p){
		me._watch (p, { create: true });
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
			
			//Update tree and watchers
			me._unwatch (oldPath, isDir);
			me._watch (newPath, {
				move: true,
				oldPath: oldPath,
				newPath: newPath,
				isDir: isDir
			});
		});
	});
	
	watcher.watch ();
};

Watcher.prototype._watchDirectory = function (p, args){
	args = args || {};

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
	
	return wrapper;
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

Watcher.prototype._watch = function (p, action){
	var next = function (p, t, w, firstMove, cb){
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
			
			me._filesWatched++;
			
			if (action){
				if (action.create){
					me.emit ("create", p, stats);
					me.emit ("any");
				}else if (firstMove && action.move){
					me.emit ("move", action.oldPath, action.newPath, action.isDir);
					me.emit ("any");
				}
			}
			
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
				
				var remaining = entries.length;
				if (!remaining){
					me._directoriesWatched++;
					var wrapper = me._watchDirectory (p);
					
					if (first){
						me._root.first = wrapper;
					}else{
						w[basename] = {
							wrapper: wrapper,
							holder: {}
						};
					}
					
					if (action){
						if (action.create){
							me.emit ("create", p, stats);
							me.emit ("any");
						}else if (firstMove && action.move){
							me.emit ("move", action.oldPath, action.newPath, action.isDir);
							me.emit ("any");
						}
					}
					
					cb (true);
					return;
				}
				
				var o = {};
				var h = first ? w : {};
				
				if (action && action.create){
					me._directoriesWatched++;
					me.emit ("create", p, stats);
					me.emit ("any");
				}
				
				entries.forEach (function (entry){
					watch (p + "/" + entry, t, h, false, function (isDir){
						o[entry] = { isDir: isDir };
						
						if (!--remaining){
							if (!action || (action && action.move)) me._directoriesWatched++;
							var wrapper = me._watchDirectory (p, { entries: o });
							
							if (first){
								me._root.first = wrapper;
							}else{
								w[basename] = {
									wrapper: wrapper,
									holder: h
								};
							}
							
							if (firstMove && action && action.move){
								me.emit ("move", action.oldPath, action.newPath,
										action.isDir);
								me.emit ("any");
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

	var watch = function (p, t, w, f, cb){
		me._filter (p, path.basename (p), function (add){
			if (!add) return cb ();
			next (p, t, w, f, cb);
		});
	};
	
	var errors = [];
	var me = this;
	var first = !action;
	
	if (first) this._tree = {};
	
	//If it's a dynamic creation, get the holders where the new entry must be
	//stored
	p = path.normalize (p);
	var treeHolder = action ? this._getTreeHolder (p) : this._tree;
	var watchersHolder = action ? this._getWatchersHolder (p) : this._watchers;
	
	watch (p, treeHolder, watchersHolder, true, function (){
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
		for (var p in watchers){
			watchers[p].wrapper.unwatch ();
			unwatch (watchers[p].holder);
		}
	};
	
	this._filesWatched = 0;
	this._directoriesWatched = 0;
	
	if (this._root.parent) this._root.parent.unwatch ();
	if (this._root.first) this._root.first.unwatch ();
	
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
