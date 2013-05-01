walkie-watchie
==============

_Node.js project_

## Warning
Because `fs.watch()` is pretty unstable this module is in a beta state until v0.1.0. A lot of changes could happen.

Editing files with vim is currently bugged with a moveDelay.

The move event only gives to me a lot of headaches because a timer is mandatory. I'm considering to remove it. The code will be more cleaner and easy to maintain and any programmatic change will be allowed.
***

#### File system watcher ####

Version: 0.0.10

The definitive file system watcher. Currently only Windows and Linux are fully supported.

The `fs.watchFile()` function is not recommended and the `fs.watch()` function is terribly bugged: duplicate emitted events, false positives, watchers emitting events when they should not, incorrect event types, the returned filename parameter is not guaranteed, it isn't cross platform, etc. This module tries to workaround all these bugs at its best so you don't have to worry about anything.

Tested on:

- Windows XP x86.
- Windows 7 x64.
- Windows 8 x64.
- Debian 6.0.7 x64.
- Linux Mint 14 x64.
- Ubuntu 12.04 x64.

#### Installation ####

```
npm install walkie-watchie
```

#### Example ####

```javascript
var watch = require ("walkie-watchie");
var util = require ("util");

var watcher = watch (".");

watcher.on ("error", function (error){
	console.error (error);
});

watcher.on ("watching", function (){
	console.log ("directories: " + watcher.directories () +
			", files: " + watcher.files ());
	console.log (util.inspect (watcher.tree (), { depth: null }));
});

watcher.on ("change", function (path){
	console.log ("change: " + path);
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

watcher.on ("move", function (oldPath, newPath, isDir){
	console.log ("move: old: " + oldPath + ", new: " + newPath + 
			", " + (isDir ? "directory" : "file"));
	console.log ("directories: " + watcher.directories () +
			", files: " + watcher.files ());
});

watcher.on ("any", function (){
	console.log ("any");
});
```

#### Caveats ####

- This module can be used without timers. It's not necessary to create a timer to avoid duplicate change events, but certain operations may require it, e.g. saving changes with the vim editor, uploading files through ssh or ftp, etc. By default it doesn't use any timer but it can be enabled. Typical timeout values may go between 10ms and 100ms. I recommend to test whether your scenario can support file changes without a timer.

	This is not an exact science, depending on the software you use to edit the files you could get errors, you could get duplicate events even with a timer, you could be notified with temporary files, etc. Please report all the inconsistencies you find and they will be fixed.

	Use this simple code to test stuff:

	```javascript
	var watch = require ("walkie-watchie");
	
	watch (".", { changeDelay: null, moveDelay: null })
			.on ("error", console.error.bind (undefined))
			.on ("change", console.log.bind (undefined, "change"))
			.on ("create", console.log.bind (undefined, "create"))
			.on ("delete", console.log.bind (undefined, "delete"))
			.on ("move", console.log.bind (undefined, "move"));
	```

- Another timer can be used to detect move events but by default it's disabled because is not 100% accurate, in that case you'll get delete and create events instead of move events.

	Take into account that a rename/move event is just a delete and create events occurring in a very short period of time so it's not possible to check if a file has been moved from one location to another (or within the same directory) or if one file has been deleted and another one has been created very quickly.
	
	For example, these two commands are error prone: `mv a b` and `rm a && touch b`. `fs.watch()` will emit in both cases in the same tick:
  
  `a` is deleted  
  `b` is created
  
  It's not possible to know if it was a move or delete-create action. If you enable the `moveDelay`, you'll get a move event in both cases. If you disable the `moveDelay` you'll get a delete and create events in both cases.

- The goal of this module is to detect any type of operation in a development environment when the user modifies files with the preferred text editor, uses the file explorer or the console terminal. File system changes are typically listened when you're writing client files (ejs, jade, less, scripts, etc.) and you need to build style and script bundles to minimize the number of requests.

	Currently, if multiple operations are done in a very short period of time unexpected behaviours could happen, like events not being emitted, incorrect events, etc. 

	You can do I/O operations programmatically and listen to the events but I don't recommend it because it's not the objective of this module and currently these type of operations are not being tested. This is because `fs.watch()` emits events in the same tick of the event loop but some asynchronous checks must be done in order to properly detect events.
	
	It's working pretty well with the `shelljs` module which uses the Node.js built-in fs functions and emit events in the same tick.
	
	If you basically use this module to know when the files are modified you shouldn't get unexpected behaviours.
	
- This module tries to fix all the incorrect events emitted by `fs.watch()` but cannot detect inconsistencies from other programs. For example, the `touch` command sometimes changes the file so you can get a create event followed by a change.

- Symbolic links are not supported. Watching a file implies watching its parent directory, so you can imagine the complexity to enable support for them.

  When a watcher is bound to a file it emits incorrect events. The basic idea is to only watch directories. However, duplicate change events are still emitted. The simplest solution is to add a lock, treat the first emitted event, emit a custom change event and then unlock.

#### Known issues ####

On Linux, when a directory is deleted, `fs.watch()` doesn't emit individual events for every file or subdirectory. In other words, if you have the following directory tree and you delete `a` you'll get only one event: `a` is deleted.

```text
a
|- f.txt
`- b
   `- f.txt
```

On Windows you can't delete `a` because the subdirectory `b` is being watched: [#3963](https://github.com/joyent/node/issues/3963). But you can delete `b` and you'll get two events: `b` is deleted and `b\f.txt` is deleted.

For uniformity reasons among operating systems, because on Windows you cannot delete a directory if there are subdirectories being watched, and because on Linux files and subdirectories doesn't emit any event when a directory is deleted, only one event will be emitted, the event that says that the directory has been deleted. If a directory has been deleted you can assume that all its content has also been deleted.

Running Node.js inside a FAT file system (e.g. USB pendrive) with a Windows portable executable is not working as expected.

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
- [Watcher#root()](#root)
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
  
  If you need to support other programs, open a new request.
  
  The default filter is:
  
  ```javascript
  var include =
			//gedit
			!beginsWith (basename, ".goutputstream-") &&
			
			//vim, this should also include "isNaN(basename)" but could filter valid
			//files or directories with a name where all the characters are numbers
			!endsWith (basename, ".swp") && !endsWith (basename, ".swpx") &&
			!endsWith (basename, ".swx") && !endsWith (basename, "~");
  ```

- changeDelay. _Number_. Delay in milliseconds between file changes events. File changes occurred within the delay period are ignored. By default it is disabled. Typical values may go between 10ms and 100ms.

- moveDelay. _Number_. Delay in milliseconds to detect rename/move events. Delete and create venets occurred in a very short period of time are considered move events. By default it is disabled. Typical values may go between 10ms and 100ms. 

<a name="directories"></a>
__Watcher#directories()__  
Returns the number of watched directories.

<a name="files"></a>
__Watcher#files()__  
Returns the number of watched files.

<a name="root"></a>
__Watcher#root()__  
Returns the main path being watched. It's the normalized path that receives the `watch()` function.

<a name="tree"></a>
__Watcher#tree()__  
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

It returns null when the watched entry is a file or when `unwatch()` has been called.

<a name="unwatch"></a>
__Watcher#unwatch()__  
Stops watching file system events.
