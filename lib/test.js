var watch = require ("./walkie-watchie");

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