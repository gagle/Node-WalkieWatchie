walkie-watchie
==============

_Node.js project_

#### File system watcher ####

Version: 0.0.1

Yet another file system watcher. This module doesn't use timers to avoid duplicate events as other modules do, it uses `setImmediate`, so it's more efficient and fast.

All the other tree traversal watchers doesn't do what they're supposed to do, they have an extraordinarily bad api, they don't manage errors properly or they are just poorly written.

The `fs.watchFile()` function is not recommended and the `fs.watch()` function is terribly bugged: duplicate emitted events, false positives, watchers emitting events when they should not, incorrect event type, the returned filename parameter is not guaranteed, etc. This module tries to workaround all these bugs at its best so you don't have to worry about anything.

#### Installation ####

```
not published
```

#### Example ####

```javascript
var watch = require ("walkie-watchie");

var watcher = watch (".");

watcher.on ("create", function (path, stats){
	console.log (">> create: " + path + ", " +
			(stats.isDirectory () ? "directory" : "file"));
	console.log (">> files: " + watcher.files () + ", directories " +
			watcher.directories ());
});

watcher.on ("delete", function (path, isDir){
	console.log (">> delete: " + path + ", " + (isDir ? "directory" : "file"));
	console.log (">> files: " + watcher.files () + ", directories: " +
			watcher.directories ());
});

watcher.on ("modify", function (path){
	console.log (">> modify: " + path);
});

watcher.on ("any", function (){
	//console.log ("any");
});

watcher.on ("error", function (error){
	console.error (error);
	watcher.unwatch ();
});
```

#### Methods ####

- [watch(path[, settings, filter])](#watch)
- [Watcher#directories()](#directories)
- [Watcher#files()](#files)
- [Watcher#unwatch()](#unwatch)

<a name="watch"></a>
__watch(path[, settings, filter])__  
Traverses the directory tree and watches for file creations/changes/deletions.   
Returns a watcher object.

Take into account that when you watch files you're locking them, and it's possible that you may not be able to delete directories.

The possible settings are:
- followLinks. _Boolean_. If true, symbolic links are followed. Default is false.

A filter can be used to process or not the current path when the directory tree is traversed. The filter receives 3 parameters: relative path, basename of that path and a callback. Pass true to the callback to process the path. The path can be a file or directory and does not mean to watch or not to watch, it just allows or not to process the path or directory. For example, when you receive a directory and the callback is called with a false value, its files are ignored. If you receive a file then it is ignored and not watched.

<a name="directories"></a>
__Watcher#directories()__  
Returns the number of watched directories.

<a name="files"></a>
__Watcher#files()__  
Returns the number of watched files.

<a name="unwatch"></a>
__Watcher#unwatch()__  
Stops watching file system events.