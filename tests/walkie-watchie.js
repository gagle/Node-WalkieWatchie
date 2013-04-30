"use strict";

var assert = require ("assert");
require ("shelljs/global");
var path = require ("path");
var fs = require ("fs");
var watch = require ("../lib/walkie-watchie");

var WINDOWS = process.platform === "win32";
var LINUX = process.platform === "linux";
var DELAY = 50;

describe ("walkie-watchie", function (){
	describe ("tree and counters", function (){
		beforeEach (function (){
			rm ("-r", "watch/*");
		});
		
		it ("should return the current state of the watched directory",
				function (done){
					var tree = {};
					tree["a1"] = path.normalize ("a/a1");
					var h = tree["b"] = {};
					h["b1"] = path.normalize ("a/b/b1");
					h["b2"] = path.normalize ("a/b/b2");
					h["c"] = {};
				
					var watcher = watch ("a")
						.on ("error", function (error){
							console.error (error);
							assert.fail ();
						})
						.on ("watching", function (){
							assert.deepEqual (watcher.tree (), tree);
							assert.strictEqual (watcher.files (), 3);
							assert.strictEqual (watcher.directories (), 3);
							watcher.unwatch ();
							done ();
						})
				});
		
		it ("should return null when the watched root is a file or when the " +
				"watcher has been unwatched, counters reset",	function (done){
					var watcher = watch ("a/a1")
						.on ("error", function (error){
							console.error (error);
							assert.fail ();
						})
						.on ("watching", function (){
							assert.strictEqual (watcher.tree (), null);
							assert.strictEqual (watcher.files (), 1);
							assert.strictEqual (watcher.directories (), 0);
							watcher.unwatch ();
							assert.strictEqual (watcher.files (), 0);
							assert.strictEqual (watcher.directories (), 0);
							
							watcher = watch ("a")
									.on ("error", function (error){
										console.error (error);
										assert.fail ();
									})
									.on ("watching", function (){
										watcher.unwatch ();
										assert.strictEqual (watcher.tree (), null);
										assert.strictEqual (watcher.files (), 0);
										assert.strictEqual (watcher.directories (), 0);
										done ();
									})
						})
				});
	});
	
	describe ("create event", function (){
		beforeEach (function (){
			rm ("-r", "watch/*");
		});
		
		it ("should listen to create events (counters updated)", function (done){
			var expected = {};
			expected[path.normalize ("watch/a")] = true;
			expected[path.normalize ("watch/a/a1")] = false;
			expected[path.normalize ("watch/a/b")] = true;
			expected[path.normalize ("watch/a/b/b1")] = false;
			expected[path.normalize ("watch/a/b/b2")] = false;
			expected[path.normalize ("watch/a/b/c")] = true;
			
			var tree = {};
			var h = tree["a"] = {};
			h["a1"] = path.normalize ("watch/a/a1");
			h = h["b"] = {};
			h["b1"] = path.normalize ("watch/a/b/b1");
			h["b2"] = path.normalize ("watch/a/b/b2");
			h["c"] = {};
			
			var o = {};
			
			var watcher = watch ("watch")
					.on ("error", function (error){
						console.error (error);
						assert.fail ();
					})
					.on ("watching", function (){
						assert.strictEqual (watcher.files (), 0);
						assert.strictEqual (watcher.directories (), 1);
						cp ("-R", "a", "watch");
					})
					.on ("create", function (p, stats){
						o[p] = stats.isDirectory ();
					});
			
			setTimeout (function (){
				assert.deepEqual (o, expected);
				assert.deepEqual (watcher.tree (), tree);
				assert.strictEqual (watcher.files (), 3);
				assert.strictEqual (watcher.directories (), 4);
				watcher.unwatch ();
				done ();
			}, 100);
		});
	});
	
	describe ("delete event", function (){
		//Cannot test programmatically when a directory is deleted using a file
		//browser. A change event is emitted for each entry in the directory
	
		beforeEach (function (){
			rm ("-r", "watch/*");
		});
		
		it ("should listen to delete events (counters updated), files deleted in " +
				"the same tick", function (done){
					cp ("a/a1", "watch/f1");
					cp ("a/a1", "watch/f2");
				
					var expected = {};
					expected[path.normalize ("watch/f1")] = false;
					expected[path.normalize ("watch/f2")] = false;
					
					var o = {};
					
					var watcher = watch ("watch")
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 2);
								assert.strictEqual (watcher.directories (), 1);
								rm ("watch/f1");
								rm ("watch/f2");
							})
							.on ("delete", function (p, isDir){
								o[p] = isDir;
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 0);
						assert.strictEqual (watcher.directories (), 1);
						assert.deepEqual (watcher.tree (), {});
						watcher.unwatch ();
						done ();
					}, 100);
				});
		
		it ("should listen to delete events (counters updated), empty directory",
				function (done){
					cp ("-R", "a/b/c", "watch");
					
					var expected = {};
					expected[path.normalize ("watch/c")] = true;
					
					var o = {};
					
					var watcher = watch ("watch")
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 0);
								assert.strictEqual (watcher.directories (), 2);
								rm ("-r", "watch/c");
							})
							.on ("delete", function (p, isDir){
								o[p] = isDir;
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 0);
						assert.strictEqual (watcher.directories (), 1);
						assert.deepEqual (watcher.tree (), {});
						watcher.unwatch ();
						done ();
					}, 100);
				});
		
		it ("should listen to delete events (counters updated), directory with " +
				"content", function (done){
					cp ("-R", "a/b/c", "watch");
					cp ("a/a1", "watch/c/f1");
					cp ("a/a1", "watch/c/f2");
					
					var expected = {};
					expected[path.normalize ("watch/c")] = true;
					
					var o = {};
					
					var watcher = watch ("watch")
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 2);
								assert.strictEqual (watcher.directories (), 2);
								rm ("-r", "watch/c");
							})
							.on ("delete", function (p, isDir){
								o[p] = isDir;
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 0);
						assert.strictEqual (watcher.directories (), 1);
						assert.deepEqual (watcher.tree (), {});
						watcher.unwatch ();
						done ();
					}, 100);
				});
		
		it ("should listen to delete events (counters updated), files and " +
				"directories deleted in the same tick", function (done){
					cp ("-R", "a/b/c", "watch");
					cp ("a/a1", "watch/c/f1");
					cp ("a/a1", "watch/c/f2");
					cp ("a/a1", "watch/f1");
					cp ("a/a1", "watch/f2");
				
					var expected = {};
					expected[path.normalize ("watch/c")] = true;
					expected[path.normalize ("watch/f1")] = false;
					expected[path.normalize ("watch/f2")] = false;
					
					var o = {};
					
					var watcher = watch ("watch")
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 4);
								assert.strictEqual (watcher.directories (), 2);
								rm ("-r", "watch/c");
								rm ("watch/f1");
								rm ("watch/f2");
							})
							.on ("delete", function (p, isDir){
								o[p] = isDir;
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 0);
						assert.strictEqual (watcher.directories (), 1);
						assert.deepEqual (watcher.tree (), {});
						watcher.unwatch ();
						done ();
					}, 100);
				});
	});
	
	describe ("change event", function (){
		beforeEach (function (){
			rm ("-r", "watch/*");
		});
		
		it ("should avoid duplicate change events without a delay", function (done){
			cp ("a/a1", "watch/f1");
			
			var tree = {};
			tree["f1"] = path.normalize ("watch/f1");
			
			var expected = {};
			expected[path.normalize ("watch/f1")] = null;
			
			var o = {};
			
			var watcher = watch ("watch")
					.on ("error", function (error){
						console.error (error);
						assert.fail ();
					})
					.on ("watching", function (){
						assert.strictEqual (watcher.files (), 1);
						assert.strictEqual (watcher.directories (), 1);
						fs.createWriteStream ("watch/f1")
								.on ("error", function (error){
									console.error (error);
									assert.fail ();
								})
								.end ("asd");
					})
					.on ("change", function (p){
						o[p] = null;
					});
			
			setTimeout (function (){
				assert.deepEqual (o, expected);
				assert.strictEqual (watcher.files (), 1);
				assert.strictEqual (watcher.directories (), 1);
				assert.deepEqual (watcher.tree (), tree);
				watcher.unwatch ();
				done ();
			}, 100);
		});
		
		it ("should listen when a file has been modified, with delay",
				function (done){
					cp ("a/a1", "watch/f1");
			
					var tree = {};
					tree["f1"] = path.normalize ("watch/f1");
			
					var expected = {};
					expected[path.normalize ("watch/f1")] = null;
			
					var o = {};
			
					var watcher = watch ("watch", { changeDelay: DELAY })
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 1);
								assert.strictEqual (watcher.directories (), 1);
								fs.createWriteStream ("watch/f1")
										.on ("error", function (error){
											console.error (error);
											assert.fail ();
										})
										.end ("asd");
							})
							.on ("change", function (p){
								o[p] = null;
							});
			
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 1);
						assert.strictEqual (watcher.directories (), 1);
						assert.deepEqual (watcher.tree (), tree);
						watcher.unwatch ();
						done ();
					}, 100);
				});
		
		it ("should avoid false positives: a and ab files, modify a, ignore ab " +
				"change event, with delay", function (done){
					cp ("a/a1", "watch/a");
					cp ("a/a1", "watch/ab");
					
					var tree = {};
					tree["a"] = path.normalize ("watch/a");
					tree["ab"] = path.normalize ("watch/ab");
					
					var expected = {};
					expected[path.normalize ("watch/a")] = null;
					
					var o = {};
					
					var watcher = watch ("watch", { changeDelay: DELAY })
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 2);
								assert.strictEqual (watcher.directories (), 1);
								fs.createWriteStream ("watch/a")
										.on ("error", function (error){
											console.error (error);
											assert.fail ();
										})
										.end ("asd");
							})
							.on ("change", function (p){
								o[p] = null;
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 2);
						assert.strictEqual (watcher.directories (), 1);
						assert.deepEqual (watcher.tree (), tree);
						watcher.unwatch ();
						done ();
					}, 100);
				});
			});
	
	describe ("move event", function (){
		beforeEach (function (){
			rm ("-r", "watch/*");
		});
		
		if (LINUX){
			it ("should listen when a directory has been renamed/moved, same " +
					"directory", function (done){
						cp ("-R", "a", "watch");
						
						var tree = {};
						var h = tree["d"] = {};
						h["a1"] = path.normalize ("watch/d/a1");
						h = h["b"] = {};
						h["b1"] = path.normalize ("watch/d/b/b1");
						h["b2"] = path.normalize ("watch/d/b/b2");
						h["c"] = {};
						
						var expected = {};
						expected[path.normalize ("watch/a")] = {
							newPath: path.normalize ("watch/d"),
							isDir: true
						};
						
						var o = {};
						
						var watcher = watch ("watch", { moveDelay: 50 })
								.on ("error", function (error){
									console.error (error);
									assert.fail ();
								})
								.on ("watching", function (){
									assert.strictEqual (watcher.files (), 3);
									assert.strictEqual (watcher.directories (), 4);
									mv ("watch/a", "watch/d");
								})
								.on ("create", function (){
									assert.fail ();
								})
								.on ("delete", function (){
									assert.fail ();
								})
								.on ("move", function (oldPath, newPath, isDir){
									o[oldPath] = { newPath: newPath, isDir: isDir };
								});
						
						setTimeout (function (){
							assert.deepEqual (o, expected);
							assert.strictEqual (watcher.files (), 3);
							assert.strictEqual (watcher.directories (), 4);
							assert.deepEqual (watcher.tree (), tree);
							watcher.unwatch ();
							done ();
						}, 200);
					});
		}
		
		it ("should listen when a file or directory has been renamed/moved, same " +
				"directory", function (done){
					cp ("a/a1", "watch/f1");
					
					var tree = {};
					tree["f2"] = path.normalize ("watch/f2");
					
					var expected = {};
					expected[path.normalize ("watch/f1")] = {
						newPath: path.normalize ("watch/f2"),
						isDir: false
					};
					
					var o = {};
					
					var watcher = watch ("watch", { moveDelay: 50 })
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 1);
								assert.strictEqual (watcher.directories (), 1);
								mv ("watch/f1", "watch/f2");
							})
							.on ("create", function (){
								assert.fail ();
							})
							.on ("delete", function (){
								assert.fail ();
							})
							.on ("move", function (oldPath, newPath, isDir){
								o[oldPath] = { newPath: newPath, isDir: isDir };
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 1);
						assert.strictEqual (watcher.directories (), 1);
						assert.deepEqual (watcher.tree (), tree);
						watcher.unwatch ();
						done ();
					}, 200);
				});
		
		it ("should listen when a file or directory has been renamed/moved, " +
				"different directory, case 1", function (done){
					cp ("-R", "a/b/c", "watch");
					cp ("a/a1", "watch/f1");
					
					var tree = {
						c: {}
					};
					tree.c["f1"] = path.normalize ("watch/c/f1");
					
					var expected = {};
					expected[path.normalize ("watch/f1")] = {
						newPath: path.normalize ("watch/c/f1"),
						isDir: false
					};
					
					var o = {};
					
					var watcher = watch ("watch", { moveDelay: 50 })
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 1);
								assert.strictEqual (watcher.directories (), 2);
								mv ("watch/f1", "watch/c/f1");
							})
							.on ("create", function (){
								assert.fail ();
							})
							.on ("delete", function (){
								assert.fail ();
							})
							.on ("move", function (oldPath, newPath, isDir){
								o[oldPath] = { newPath: newPath, isDir: isDir };
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 1);
						assert.strictEqual (watcher.directories (), 2);
						assert.deepEqual (watcher.tree (), tree);
						watcher.unwatch ();
						done ();
					}, 200);
				});
		
		it ("should listen when a file or directory has been renamed/moved, " +
				"different directory, case 2", function (done){
					cp ("-R", "a/b/c", "watch");
					cp ("a/a1", "watch/c/f1");
					
					var tree = {
						c: {},
						f1: path.normalize ("watch/f1")
					};
					
					var expected = {};
					expected[path.normalize ("watch/c/f1")] = {
						newPath: path.normalize ("watch/f1"),
						isDir: false
					};
					
					var o = {};
					
					var watcher = watch ("watch", { moveDelay: 50 })
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 1);
								assert.strictEqual (watcher.directories (), 2);
								mv ("watch/c/f1", "watch/f1");
							})
							.on ("create", function (){
								assert.fail ();
							})
							.on ("delete", function (){
								assert.fail ();
							})
							.on ("move", function (oldPath, newPath, isDir){
								o[oldPath] = { newPath: newPath, isDir: isDir };
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 1);
						assert.strictEqual (watcher.directories (), 2);
						assert.deepEqual (watcher.tree (), tree);
						watcher.unwatch ();
						done ();
					}, 200);
				});
				
		it ("should receive delete and create events if no delay is configured, " +
				"same directory",
				function (done){
					cp ("a/a1", "watch/f1");
					
					var tree = {
						f2: path.normalize ("watch/f2")
					};
					
					var expected = {};
					expected[path.normalize ("watch/f2")] = {
						type: "create", isDir: false
					};
					expected[path.normalize ("watch/f1")] = {
						type: "delete", isDir: false
					};
					
					var o = {};
					
					var watcher = watch ("watch")
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 1);
								assert.strictEqual (watcher.directories (), 1);
								mv ("watch/f1", "watch/f2");
							})
							.on ("create", function (p, stats){
								o[p] = { type: "create", isDir: stats.isDirectory () };
							})
							.on ("delete", function (p, isDir){
								o[p] = { type: "delete", isDir: isDir };
							})
							.on ("move", function (){
								assert.fail ();
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 1);
						assert.strictEqual (watcher.directories (), 1);
						assert.deepEqual (watcher.tree (), tree);
						watcher.unwatch ();
						done ();
					}, 100);
				});
		
		it ("should receive delete and create events if no delay is configured, " +
				"different directory",
				function (done){
					cp ("-R", "a/b/c", "watch");
					cp ("a/a1", "watch/c/f1");
					
					var tree = {
						c: {},
						f1: path.normalize ("watch/f1")
					};
					
					var expected = {};
					expected[path.normalize ("watch/f1")] = {
						type: "create", isDir: false
					};
					expected[path.normalize ("watch/c/f1")] = {
						type: "delete", isDir: false
					};
					
					var o = {};
					
					var watcher = watch ("watch")
							.on ("error", function (error){
								console.error (error);
								assert.fail ();
							})
							.on ("watching", function (){
								assert.strictEqual (watcher.files (), 1);
								assert.strictEqual (watcher.directories (), 2);
								mv ("watch/c/f1", "watch/f1");
							})
							.on ("create", function (p, stats){
								o[p] = { type: "create", isDir: stats.isDirectory () };
							})
							.on ("delete", function (p, isDir){
								o[p] = { type: "delete", isDir: isDir };
							})
							.on ("move", function (){
								assert.fail ();
							});
					
					setTimeout (function (){
						assert.deepEqual (o, expected);
						assert.strictEqual (watcher.files (), 1);
						assert.strictEqual (watcher.directories (), 2);
						assert.deepEqual (watcher.tree (), tree);
						watcher.unwatch ();
						done ();
					}, 100);
				});
		
		after (function (){
			rm ("-r", "watch/*");
		});
	});
});
