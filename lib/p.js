var fs = require("fs").watch (".", function (e, f){
	console.log(e,f)
})