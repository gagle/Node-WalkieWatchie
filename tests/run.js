"use strict";

var Runner = require ("mocha-runner");

new Runner ({
	exclude: ["a", "watch"],
	tests: ["walkie-watchie.js"]
}).run (function (error){
	if (error) console.error (error);
});