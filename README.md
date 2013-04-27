walkie-watchie
==============

_Node.js project_

## Warning
Because `fs.watch()` is pretty unstable this module is in a beta state until v0.1.0.
***

#### File system watcher ####

Version: 0.0.7

The definitive file system watcher. Currently only Windows and Linux are fully supported.

Tested on:

- Windows XP x86.
- Windows 7 x64.
- Windows 8 x64.
- Linux Mint 14 x64.

This module can be used without timers. It's not necessary to create a timer to avoid duplicate change events on Windows, but for compatibility reasons among operating systems a 50ms timeout is set by default, but it can be disabled. Also, another timer with 50ms timeout is being used to detect rename/move events but it also can be disabled, in that case you'll get delete and create events instead of move events.

All the other tree traversal watchers doesn't do what they're supposed to do, they have an extraordinarily bad api, they don't manage errors properly, they are poorly written, they are incomplete and lack some events or they are just abandoned.

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

#### Caveats ####

- Currently, if multiple operations are done in a very short period of time unexpected behaviours could happen, like events not being emitted, incorrect events, etc. This is because `fs.watch()` emits events in the same tick of the event loop but some asynchronous checks must be done in order to properly detect events.

  If you basically use this module to know when the files are modified you shouldn't get unexpected behaviours.

- This module tries to fix all the incorrect events emitted by `fs.watch()` but cannot detect inconsistencies from other programs. For example, the `touch` command sometimes changes the file so you can get a create event followed by a change.

- Symbolic links are not supported.

#### Known issues ####

On Linux when a directory is deleted `fs.watch()` does not emit individual events for every file or subdirectory. In other words, if you have the following directory tree and you delete `a` you'll get only one event: `a` is deleted.

```text
a
|- f.txt
`- b
   `- f.txt
```

On Windows you can't delete `a` because the subdirectory `b` is being watched: [#3963](https://github.com/joyent/node/issues/3963). But you can delete `b` and you'll get two events: `b` is deleted and `b\f.txt` is deleted.

For uniformity reasons among operating systems, because on Windows you cannot delete a directory if there are subdirectories being watched, and because on Linux files and subdirectories doesn't emit any event when a directory is deleted, only one event will be emitted, the event that says that the directory has been deleted.

#### Events ####

- `watching`. Emitted after all the directory tree has been traversed for the first time after `watch()` is called.
- `create`. Emitted when a file or directory has been created. The callback receives the path and the `Stats` object.
- `delete`. Emitted when a file or directory has been deleted. The callback receives the path and a boolean indicating if the entry is a directory.
- `change`. Emitted when a file has been modified. The callback receives the path of the file.
- `move`. Emitted when a file or directory has been moved to another location being watched (also know as rename). The callback receives the old and new paths and a boolean indicating if the entry is a directory. If the destination location is not being watched a `delete` event will be emitted.
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

The possible settings are:
- filter. _Function_. Filters files, directories and events. The function receives 3 parameters: relative path, basename and a callback. Pass true to the callback to permit the file, directory or event. The filter does not mean to watch or not to watch because it can also filter events, it just allows or not to process the file, directory or event.

  For example, when you receive a directory and the callback is called with a false value, its files are ignored. If you receive a file then it is ignored.

  For example, to only allow .css files:
  
  ```javascript
  var filter = function (p, basename, cb){
		fs.lstat (p, function (error, stats){
			if (error) return console.error (error);
			if (stats.isDirectory ()){
				cb (true);
			}else{
				cb (path.extname (basename) === ".css");
			}
		});
	};
	watch (".", { filter: filter });
  ```

- defaultFilter. _Object_. Set it to null to disable the default filter. The default filter ignores some common patterns. It's heavily recommended to maintain the default filter.

  The default filter ignores the following files:
  
  - Gedit temporary files.
  - Vim temporary files.
  - .DS_Store.
  
  If you need to support other programs, open a new request.
  
  The default filter is:
  
  ```javascript
  var include =
			//.DS_Store
			basename !== ".DS_Store" &&
  		
			//gedit
			!beginsWith (basename, ".goutputstream-") &&
			
			//vim, this should also include "isNaN(basename)" but can filter valid
			//files or directories with a name where all the characters are numbers
			!endsWith (basename, ".swp") && !endsWith (basename, ".swx") &&
			!endsWith (basename, "~");
  ```

- changeDelay. _Number_. Delay in milliseconds between file changes events. File changes occurred within the delay period are ignored. Default is 50ms. Set it to null to disable the timer but take into account that some platforms (Unix-like) need a timer to avoid duplicate change events.

- renameDelay. _Number_. Delay in milliseconds to detect rename/move events. Default is 50ms. Take into account that a rename/move event it's just a delete followed by a create (from the `fs.watch()` point of view) so it's not possible to check if a file has been moved from one location to another (or within the same directory) that's why a timer is needed to detect rename/move events.

  The goal of this module is to detect any type of operation in a development environment when the user modifies files with the preferred text editor or uses the file explorer or console. File system changes are typically listened when you're writing client files (ejs, jade, less, scripts, etc.) and you need to build style and script bundles to minimize the number of requests.
  
  The rename/move event can't be detected without a timer. If you rename a file and immediately after you create another file bad things could happen. The first renamed file could be interpreted as a new file and the second created file could be interpreted as a renamed file because the rename/move timer is still active.
  
  However, the rename/move timer can be disabled setting `renameDelay` to null and therefore no rename/move events will be emitted. Rename/move events will be interpreted as a delete followed by a create.
  
  Another example. These two command are error prone: `mv a b` and `rm a && touch b`. `fs.watch()` will emit in both cases in the same tick:
  
  `a` is deleted  
  `b` is created
  
  It's not possible to know if it was a move or delete-create action. If you are using a `renameDelay`, you'll get a move event in both cases. If you disable the `renameDelay` you'll get a delete and create events in both cases.

<a name="directories"></a>
__Watcher#directories()__  
Returns the number of watched directories.

<a name="files"></a>
__Watcher#files()__  
Returns the number of watched files.

<a name="tree"></a>
__Watcher#files()__  
Returns a plain structured object with all the files and directories being watched. The value of a file property is the relative path from the current working directory. For example:

```javascript
watch ("my/dir");

{
	a: "my/dir/a",
	b: "my/dir/b",
	c: {
		a: "my/dir/c/a",
		b: "my/dir/c/b",
		c: "my/dir/c/c"
	},
	d: {}
}
```

<a name="unwatch"></a>
__Watcher#unwatch()__  
Stops watching file system events.
