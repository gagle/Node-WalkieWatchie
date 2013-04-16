var watch = require ("./walkie-watchie");

var watcher = watch ("a");

watcher.on ("watching", function (){
	console.log ("directories: " + watcher.directories ());
	console.log ("files: " + watcher.files ());
	//console.log (watcher.tree ());
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
	//console.log ("any");
});

watcher.on ("error", function (error){
	console.error (error);
});
