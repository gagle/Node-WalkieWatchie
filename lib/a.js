var watch = require ("./walkie-watchie");

var ww = watch (".");

ww.on ("create", function (path, isDirectory){
	console.log ("create: " + path + ", " + (isDirectory ? "directory" : "file"));
	console.log ("remaining: " + ww.watched ());
});

ww.on ("delete", function (path, isDirectory){
	console.log ("delete: " + path + ", " + (isDirectory ? "directory" : "file"));
	console.log ("remaining: " + ww.watched ());
});

ww.on ("change", function (path){
	console.log ("change: " + path);
});

ww.on ("any", function (){
	console.log ("any");
});

ww.on ("error", function (error){
	console.error (error);
	ww.unwatch ();
});