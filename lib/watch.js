"use strict";

var fs = require ("fs");
var util = require ("util");
var events = require ("events");
var path = require ("path");

module.exports = function (p, entries, root, rootIsDir){
	return new Wrapper (p, entries, root, rootIsDir);
};

var Wrapper = function (p, entries, root, rootIsDir){
	events.EventEmitter.call (this);
	this._dir = p;
	this._entries = entries;
	this._keys = Object.keys (entries);
	this._root = root ? {
		entry: root,
		isDir: rootIsDir
	} : null;
	this._watcher = null;
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
	if (this._root && this._root.entry !== entry) return;
	
	var p = path.join (this._dir, entry);
	var isDir = this._root ? this._root.isDir : this._entries[entry].isDir;
	
	if (!this._root){
		delete this._entries[entry];
		this._keys = Object.keys (this._entries);
	}else{
		this.unwatch ();
	}
	
	this.emit ("delete", p, isDir);
};

Wrapper.prototype._create = function (entry){
	if (this._root && this._root.entry !== entry) return;
	
	var p = path.join (this._dir, entry);
	var me = this;
	
	fs.lstat (p, function (error, stats){
		if (error) return me.emit ("error", error);
		
		me._entries[entry] = { isDir: stats.isDirectory (), lock: false };
		me._keys = Object.keys (me._entries);
		
		me.emit ("create", p, stats);
	});
};

Wrapper.prototype._createOrDelete = function (){
	var me = this;
	
	//Read current entries and compare with the previous entries
	fs.readdir (this._dir, function (error, entries){
		if (error) return me.emit ("error", error);
		
		me._checkDelete (function (entry){
			if (entry){
				me._delete (entry);
			}else{
				var entry = me._checkCreate (entries);
				if (entry){
					me._create (entry);
				}
			}
		});
	});
};

Wrapper.prototype._modify = function (entry){
	if (this._root && this._root.entry !== entry) return;
	
	this.emit ("modify", path.join (this._dir, entry));
	this._entries[entry].lock = false;
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
		//EPERM can be emitted when a watched directory is deleted
		if (error.code === "EPERM") return me.unwatch ();
		me.emit ("error", error);
	});
	
	this._watcher.on ("change", function (event, entry){
		if (event === "rename"){
			me._createOrDelete ();
		}else if (event === "change"){
			//If a directory is deleted a "change" event is emitted for every file
			//Ignore file changes in the root directory
			if (me._entries[entry] === null && me._root.entry !== entry) return;
			
			//Lock because only one change event is needed when the directory is
			//deleted and to avoid duplicate change events when a file is modified
			if (me._entries[entry].lock) return;
			me._entries[entry].lock = true;
			
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