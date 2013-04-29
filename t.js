var watch = require ("../lib/walkie-watchie");

var watcher = watch (".");
watcher.on ("error", console.error.bind (undefined));
watcher.on ("watching", function (){
	console.log ("directories: " + watcher.directories ());
	console.log ("files: " + watcher.files ());
	console.log (require("util").inspect (watcher.tree (), {depth:null}));
});
watcher.on ("move", function (oldPath, newPath, isDir){
	console.log ("move: old: " + oldPath + ", new: " + newPath + 
			", " + (isDir ? "directory" : "file"));
	console.log (require("util").inspect (watcher.tree (), {depth:null}));
});
watcher.on ("create", function (path, stats){
	console.log ("create: " + path + ", " +
			(stats.isDirectory () ? "directory" : "file"));
	console.log ("directories: " + watcher.directories () +
			", files: " + watcher.files ());
	console.log (require("util").inspect (watcher.tree (), {depth:null}));
});

watcher.on ("delete", function (path, isDir){
	console.log ("delete: " + path + ", " + (isDir ? "directory" : "file"));
	console.log ("directories: " + watcher.directories () +
			", files: " + watcher.files ());
	console.log (require("util").inspect (watcher.tree (), {depth:null}));
});