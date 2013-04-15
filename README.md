walkie-watchie
==============

_Node.js project_

#### File system watcher ####

Version: 0.0.1

The deiitive file system watcher. Currently only Windows is fully supported.

This module doesn't use timers to avoid duplicate events as other modules do, so it's more efficient and fast. Only one timer is being used to detect rename/move events and it can be disabled. By default file changes are emitted without any delay.

All the other tree traversal watchers doesn't do what they're supposed to do, they have an extraordinarily bad api, they don't manage errors properly, they are poorly written or they are incomplete and lack some events.

The `fs.watchFile()` function is not recommended and the `fs.watch()` function is terribly bugged: duplicate emitted events, false positives, watchers emitting events when they should not, incorrect event types, the returned filename parameter is not guaranteed, etc. This module tries to workaround all these bugs at its best so you don't have to worry about anything.

When a watcher is bound to a file it emits incorrect events. The basic idea is to only watch directories. However, duplicate change events are still emitted. The simplest solution is to add a lock, treat the first emitted event, emit a custom change event and then unlock.

#### Installation ####

```
npm install walkie-watchie
```

#### Example ####

```javascript
var watch = require ("walkie-watchie");

var watcher = watch (".");

watcher.on ("watching", function (){
	console.log ("directories: " + watcher.directories ());
	console.log ("files: " + watcher.files ());
	console.log (watcher.tree ());
});

watcher.on ("create", function (path, stats){
	console.log ("create: " + path + ", " +
			(stats.isDirectory () ? "directory" : "file"));
	console.log ("directories: " + watcher.directories () +
			", files: " + watcher.files ());
});

watcher.on ("delete", function (path, isDir){
	console.log ("delete: " + path + ", " + (isDir ? "directory" : "file"));
	console.log ("directories: " + watcher.directories () +
			", files: " + watcher.files ());
});

watcher.on ("change", function (path){
	console.log ("change: " + path);
});

watcher.on ("move", function (oldPath, newPath, isDir){
	console.log ("move: old: " + oldPath + ", new: " + newPath + 
			", " + (isDir ? "directory" : "file"));
});

watcher.on ("any", function (){
	console.log ("any");
});

watcher.on ("error", function (error){
	console.error (error);
});
```

#### Events ####

- `watching`. Emitted after all the directory tree has been traversed and all the watchers has been bound after `watch()` is called.
- `create`. Emitted when a file or directory has been created. The callback receives the path and the `Stats` object.
- `delete`. Emitted when a file or directory has been deleted. The callback receives the path and a boolean indicating if the entry is a directory.
- `change`. Emitted when a file has been modified. The callback receives the path of the file.
- `move`. Emitted when a file or directory has been moved to another location being watched (also know as rename). The callback receives the old and new paths and a boolean indicating if the entry is a directory.
- `any`. Emitted right after a `create`, `delete`, `change` or `move` event is emitted.
- `error`. Emitted when an error occurs. The watcher is closed automatically.

#### Methods ####

- [watch(path[, settings])](#watch)
- [Watcher#directories()](#directories)
- [Watcher#files()](#files)
- [Watcher#tree()](#tree)
- [Watcher#unwatch()](#unwatch)

<a name="watch"></a>
__watch(path[, settings])__  
Traverses the directory tree and watches for file and directory events. The path can be a file or a directory.   
Returns a watcher object.

Take into account that on Windows you may not be able to delete directories: [#3963](https://github.com/joyent/node/issues/3963).

The possible settings are:
- filter. _Function_. Filters the files/directories. The function receives 3 parameters: relative path, filename and a callback. Pass true to the callback to process the path. The path can be a file or directory and does not mean to watch or not to watch, it just allows or not to process the path or directory. For example, when you receive a directory and the callback is called with a false value, its files are ignored. If you receive a file then it is ignored and not watched.

  For example, to watch .css files:
  
  ```javascript
  var filter = function (p, filename, cb){
		fs.lstat (p, function (error, stats){
			if (error) return console.error (error);
			if (stats.isDirectory ()){
				cb (true);
			}else{
				cb (path.extname (filename) === ".css");
			}
		});
	};
	watch (".", { filter: filter });
  ```

- changeDelay. _Number_. Delay in milliseconds between file changes events. File changes occurred within the delay period are ignored. There's no delay by default.
- renameDelay. _Number_. Delay in milliseconds to detect rename/move events. Default is 10ms. Take into account that a rename/move event it's just a delete followed by a create (from the `fs.watch()` point of view) so it's not possible to check if a file has been moved from one location to another (or within the same directory) or if a new file has been created. That's why a timer is needed to detect rename/move events.

  The goal of this module is to detect any type of operation in a development environment when the user modifies files with the preferred text editor or uses the file explorer or console. File system changes are typically listened when you're writing client files (ejs, jade, less, scripts, etc.) and you need to build style and script bundles to minimize the number of requests.
  
  The rename/move event can't be detected without a timer. If you rename a file and immediately after you create another file bad things could happen; the first renamed file could be interpreted as a new file and the second created file could be interpreted as a renamed file because the rename/move timer is still active. Therefore, use this module to listen events when the user performs manual operations.
  
  However, the rename/move timer can be disabled setting a `renameDelay` to -1 and therefore no rename/move events will be emitted. Rename/move events will be interpreted as a delete followed by a create.

<a name="directories"></a>
__Watcher#directories()__  
Returns the number of watched directories.

<a name="files"></a>
__Watcher#files()__  
Returns the number of watched files.

<a name="tree"></a>
__Watcher#files()__  
Returns a plain structured object with all the files and directories being watched. For example:

```javascript
{
	".": {
		a: null,
		b: null,
		c: {
			a: null,
			b: null,
			c: null
		},
		d: {}
	}
}
```

<a name="unwatch"></a>
__Watcher#unwatch()__  
Stops watching file system events.