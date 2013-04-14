var fs = require("fs").watch (".", function (e, f){
	console.log(". >",e,f)
})

/*var fs = require("fs").watch ("j", function (e, f){
	console.log("j >",e,f)
})*/