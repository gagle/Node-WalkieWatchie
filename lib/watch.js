"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");

module.exports = function (p, isDir){
	return new Wrapper (p, isDir);
};

var Wrapper = function (p, isDir){
	events.EventEmitter.call (this);
	this._path = p;
	if (!isDir){
		this._dirname = path.dirname (p);
		this._basename = path.basename (p);
	}
	this._watcher = null;
	this._isDir = !!isDir;
};

util.inherits (Wrapper, events.EventEmitter);

Wrapper.prototype.unwatch = function (){
	if (!this._watcher) return;
	this._watcher.close ();
	this._watcher = null;
};

Wrapper.prototype._createDirectory = function (entry, stats){
	this._dirs.push (entry);
	entry = path.join (this._path, entry);
	this.emit ("create", entry, stats);
};

Wrapper.prototype._createFile = function (entry, stats){
	entry = path.join (this._path, entry);
	this.emit ("create", entry, stats);
};

Wrapper.prototype._deleteDirectory = function (p){
	if (!p){
		this.unwatch ();
		p = this._path;
	}
	
	for (var i=0, len=this._dirs.length; i<len; i++){
		if (this._dirs[i] === p){
			this._dirs.splice (i, 1);
			break;
		}
	}
	this.emit ("delete", p, true);
};

Wrapper.prototype._deleteFile = function (){
	//this.unwatch ();
	this.emit ("delete", this._path, false);
};

Wrapper.prototype._modifyFile = function (p){
	this.emit ("modify", p);
};

Wrapper.prototype._isDirectoryDeleted = function (cb){
	var i = 0;
	var len = this._dirs.length;
	var me = this;
	
	var check = function (){
		if (i < len){
			var p = path.normalize (me._path + "/" + me._dirs[i]);
			fs.exists (p, function (exists){
				if (!exists){
					cb (p);
				}else{
					i++;
					check ();
				}
			});
		}else{
			cb ();
		}
	};
	
	check ();
};

Wrapper.prototype._dirs = function (p, cb){
	var dirs = [];
	var errors = [];
	
	fs.readdir (p, function (error, entries){
		if (error) return cb (error);
		
		var remaining = entries.length;
		if (!remaining) return cb (null, dirs);
		
		entries.forEach (function (entry){
			fs.stat (p + "/" + entry, function (error, stats){
				if (error){
					errors = errors.concat (error);
				}else if (stats.isDirectory ()){
					dirs.push (entry);
				}
				
				if (!--remaining){
					if (errors.length){
						cb (errors);
					}else{
						cb (null, dirs);
					}
				}
			});
		});
	});
};

Wrapper.prototype.watch = function (){console.log("WATCHING",this._path)
	if (this._watcher) return;
	
	var me = this;
	
	var next = function (){
		try{
			me._watcher = fs.watch (me._path);
		}catch (error){
			return me.emit ("error", error);
		}
		
		me._watcher.on ("error", function (error){
			//EPERM when watching a directory and a subdirectory (created a
			//posteriori) is deleted, e.g. dir a, create dir a/b, watch a, delete a/b,
			//b emits eperm
			//Ignore it because the delete directory event is already emited
			if (me._isDir && error.code === "EPERM") return me.unwatch ();
			me.emit ("error", error);
		});
		
		me._watcher.on ("change", function (event, entry){
			if (me._isDir){console.log("raw dir:",event, entry)
				//Warning! The entry name is only guaranteed on Windows and Linux
				if (event === "rename"){
					if (entry){
						fs.stat (me._path + "/" + entry, function (error, stats){
							if (error) return me.emit ("error", error);
							if (stats.isDirectory ()){
								me._createDirectory (entry, stats);
							}else{
								me._createFile (entry, stats);
							}
						});
					}else{
						//Check if the deleted entry is a directory
						/*me._isDirectoryDeleted (function (p){
							if (p){
								me._deleteDirectory (p);
							}
						});*/
						
					}
				}else if (event === "change"){
					var p = path.join (me._path, entry);
					fs.stat (p, function (error, stats){
						if (error && error.code !== "ENOENT"){
							return me.emit ("error", error);
						}
						if (!stats.isDirectory ()) me._modifyFile (p);
					});
				}
			}else{console.log("raw file:",event, entry)
				/*if (event === "rename"){
					me._deleteFile ();
				}else if (event === "change"){
					//If a directory is deleted a "change" event is emitted on every file
					fs.exists (me._dirname, function (exists){
						if (!exists) me._deleteFile ();
					});
				}*/
			}
		});
	};
	
	//Read the directory entries
	if (this._isDir){
		this._dirs (this._path, function (error, dirs){
			if (error) return me.emit ("error", error);
			me._dirs = dirs;
			next ();
		});
	}else{
		next ();
	}
};