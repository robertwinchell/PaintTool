// Paint module
function Paint() {
}

(function($) {
"use strict"

var M = Paint; // a shortcut for this module

M.sh = {}; // all shaderinfo objects in one place

M.stroke = []; // array of current strokes to display
M.arrays = { position: {  // arrays of triangles to draw using brush
		numComponents: 2, data: []
	},
	texcoord: {
		numComponents: 2, data: []
	}
};

M.renderpending = false; // true if render already pending, reset during render

var gl = twgl.getWebGLContext(document.getElementById("c"));
M.c = $("#c"); // canvas in jquery format
M.templatesbtn = $("#templatesbtn");
M.brushbtn = $("#brushbtn");
M.bucketbtn = $("#bucketbtn");
M.eraserbtn = $("#eraserbtn");
M.clearbtn = $("#clearbtn");
M.openbtn = $("#openbtn");
M.colorbtn = $("#colorbtn");

M.theme = [["Animals", "animals"], ["Lifestyle", "lifestyle"],
		["Mandalas", "mandalas"], ["Mazes & Themes", "mazeTheme"],
		["Nature & Landscapes", "natureLand"],
		["Religious & Holidays", "relandhol"]];

M.radii = [1, 2, 3, 4, 5, 8, 10, 15, 20, 30];
M.brr = 20; // brush radius in pixels
M.curtool = "brush"; // current tool, default is "brush"
M.curtheme = 0; // index of the current theme
M.curtemplate = ""; // url of the current template or empty string if none
M.backtool = ""; // tool to come back to after a template picker et c.
M.bgcolor = [0.8, 0.8, 0.8, 1.0]; // background color
M.fgcolor = [0.0, 0.3, 0.7, 1.0]; // foreground color

M.sh.fit = twgl.createProgramInfo(gl, ["vs_fit", "fs_fit"]); // build fit shader
M.sh.brush = twgl.createProgramInfo(gl, ["vs_brush", "fs_brush"]); // draws disk
M.sh.eraser = twgl.createProgramInfo(gl, ["vs_eraser", "fs_eraser"]); // eraser

// buffer to draw a square:
var arrays = {
	position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
};
M.bufinfo = twgl.createBufferInfoFromArrays(gl, arrays);

M.texmeta = {}; // width and height of each source image will be stored here
M.textures = {};
/*
M.textures = twgl.createTextures(gl, {
	// cherry
//	cherry: { src: "img.jpg", mag: gl.LINEAR }
//	cherry: { src: "xl.png", mag: gl.LINEAR }
	cherry: { src: "assets/animals/1.png", mag: gl.LINEAR }
//	cherry: { src: "img.png", mag: gl.LINEAR }
}, moretex);
*/

//gl.bindTexture(gl.TEXTURE_2D, M.textures.cherry);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // flip texture vertically

// when textures are added we need to store image info
function moretex(err, textures, sources) {
	var keyarr = Object.keys(sources);
	for(var i = 0; i < keyarr.length; ++i) {
		M.texmeta[keyarr[i]] = [sources[keyarr[i]].width,
			sources[keyarr[i]].height];
	}
	// render the background texture to the background buffer:
//	tex2bg("cherry");
	requestAnimationFrame(render);
}

M.addbrushnode = function(pos) {
	pos[0] = pos[0] - gl.canvas.width * 0.5; // offset to get -1 to +1
	pos[1] = gl.canvas.height * 0.5 - pos[1]; // invert Y
	var ratio = [2 / gl.canvas.width, 2 / gl.canvas.height];
//	var glpos = [pos[0] / gl.canvas.width, pos[1] / gl.canvas.height];
	M.arrays.position.data.push(
		(pos[0] - M.brr) * ratio[0],
		(pos[1] - M.brr) * ratio[1],
		(pos[0] + M.brr) * ratio[0],
		(pos[1] - M.brr) * ratio[1],
		(pos[0] - M.brr) * ratio[0],
		(pos[1] + M.brr) * ratio[1],

		(pos[0] - M.brr) * ratio[0],
		(pos[1] + M.brr) * ratio[1],
		(pos[0] + M.brr) * ratio[0],
		(pos[1] - M.brr) * ratio[1],
		(pos[0] + M.brr) * ratio[0],
		(pos[1] + M.brr) * ratio[1]
	);
	M.arrays.texcoord.data.push(0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1);
};

M.ondragstart = function(e) {
};

M.ondragmove = function(e) {
	if(M.curtool == "bucket") {
		return;
	}
	M.addbrushnode([e.px_current_x - M.c.offset().left,
		e.px_current_y - M.c.offset().top]);
	if(!M.renderpending) {
		M.renderpending = true;
		requestAnimationFrame(render);
	}
};

M.ondragend = function() {
};

$('#c').bind('udragstart.udrag',	M.ondragstart)
	.bind('udragmove.udrag',	M.ondragmove)
	.bind('udragend.udrag',		M.ondragend);
$('#c').bind('touchstart mousedown', function(e) {
	e.preventDefault();
	if(M.curtool == "bucket") {
		M.dobucket([e.originalEvent.clientX - M.c.offset().left,
		M.bg.height - (e.originalEvent.clientY - M.c.offset().top)]);
		return;
	}
	M.addbrushnode([e.originalEvent.clientX - M.c.offset().left,
		e.originalEvent.clientY - M.c.offset().top]);
	if(!M.renderpending) {
		M.renderpending = true;
		requestAnimationFrame(render);
	}
});

// switch button like on an old radio
M.btnswitch = function(newtool) {
	if(!newtool) {
		newtool = "brush";
	}
	if(newtool == "brush" || newtool == "eraser" || newtool == "bucket") {
		M.backtool = newtool;
	}
	M.curtool = newtool;
	M.templatesbtn.removeClass("selected");
	M.brushbtn.removeClass("selected");
	M.bucketbtn.removeClass("selected");
	M.eraserbtn.removeClass("selected");
	M[M.curtool + "btn"].addClass("selected");
};

// this function is called when a user clicks on a picker but outside of buttons
M.ontemplatepick = function() {
	M.btnswitch(M.backtool);
	$("#pickerhinge").empty();
};

// replace the background with a new template image
M.settemplate = function() {
	M.curtemplate = $(this).data("imgurl");
	if(!M.curtemplate) {
		return;
	}
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
	if(M.textures.template) { // delete previous template texture from RAM
		gl.deleteTexture(M.textures.template);
		M.textures.template = undefined;
		M.texmeta.template = undefined;
	}
	M.textures.template = twgl.createTexture(gl, {
		mag: gl.LINEAR,
		min: gl.LINEAR,
		src: M.curtemplate
	}, function(err, texture, source) {
		M.texmeta.template = [source.width, source.height];
		tex2bg("template");
		requestAnimationFrame(render);
	});
};

// this function is called when a colorbtn is clicked
M.oncolorchange = function() {
	M.btnswitch("color");
	var hinge = $("#pickerhinge");
	hinge.empty();
	var div = $("<div>").attr("id", "pickerwrap").click(function() {
		M.ontemplatepick(); // close on click outside of any button
	});
	hinge.append(div);
	// create a vertical toolbar for brush thinckness buttons:
	var vtoolbar = $("<div>").addClass("vtoolbar")
		.css("margin-left", "40px");
	for(var i = 0; i < 9; ++i) {
		var radius = M.radii[i];
		var btn = $("<div>").addClass("tbtn")
			.css("background-image",
				 brushcss(radius, M.fgcolor, M.bgcolor))
			.data("brr", radius)
			.click(function() {
				M.brr = $(this).data("brr");
				requestAnimationFrame(render);
			});
		vtoolbar.append(btn);
	}
	div.append(vtoolbar);

	var q = 1 / 255;
	for(var i = 0; i < 256; i += 51) {
		for(var j = 0; j < 256; j += 51) {
			for(var k = 0; k < 256; k += 51) {
				var color = "rgba(" + i + "," + j
					+ "," + k + ",1)";
				var fgcolor = [i * q, j * q, k * q, 1.0];
				var btn = $("<div>").addClass("swatchbtn")
					.data("fgcolor", fgcolor)
					.css("background-color", color)
					.click(function() {
						var fgcolor = $(this).data(
							"fgcolor");
						M.fgcolor[0] = fgcolor[0];
						M.fgcolor[1] = fgcolor[1];
						M.fgcolor[2] = fgcolor[2];
						M.fgcolor[3] = fgcolor[3];
						requestAnimationFrame(render);
						M.commit();
					});
				div.append(btn);
			}
		}
	}
};

M.colorbtn.click(function() {
	M.oncolorchange();
});

M.onthemechange = function() {
	M.btnswitch("templates");
	var hinge = $("#pickerhinge");
	hinge.empty();
	var div = $("<div>").attr("id", "pickerwrap").click(function() {
		M.ontemplatepick();
	});
	var subtoolbar = $("<div>").addClass("subtoolbar");
	for(var i = 0; i < M.theme.length; ++i) {
		var btn = $("<div>").addClass("stbtn")
			.append("<div class='btntext'>" + M.theme[i][0] +
			"</div>").data("themeind", i).click(function(e) {
				e.stopPropagation();
				M.curtheme = $(this).data("themeind");
				M.onthemechange();
			});
		if(i == M.curtheme) {
			btn.addClass("selected");
		}
		subtoolbar.append(btn);
	}
	subtoolbar.append($("<div>").addClass("closebtn")
			.append("<div class='btntext'>X</div>"));
	div.append(subtoolbar);
	div.append($("<div style='clear: both'></div>"));
	for(var i = 0; i < 24; ++i) {
		var url = "assets/" + M.theme[M.curtheme][1] + "/" + (i + 1);
		var btn = $("<div>").addClass("minibtn")
			.css("background-image", "url('" + url + "btn.png')")
			.data("imgurl", url + ".png")
			.click(M.settemplate);
		div.append(btn);
	}
	hinge.append(div);

};

M.templatesbtn.click(function() {
	M.onthemechange();
});

M.brushbtn.click(function() {
	M.commit();
	M.btnswitch("brush");
	$("#pickerhinge").empty();
});

$("#bucketbtn").click(function() {
	M.commit();
	M.btnswitch("bucket");
	$("#pickerhinge").empty();
});

$("#eraserbtn").click(function() {
	M.commit();
	M.btnswitch("eraser");
	$("#pickerhinge").empty();
}); 

$("#clearbtn").click(function() {
	M.doclear();
});

$("#finput").change(function() {
	if(this.files && this.files[0]) {
		console.log(this.files[0]);
		var reader = new FileReader();
		reader.onload = function(e) {
//			$('#preview').attr('src', e.target.result);
			if(M.textures.template) { // delete previous template
				gl.deleteTexture(M.textures.template);
				M.textures.template = undefined;
				M.texmeta.template = undefined;
			}
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			M.textures.template = twgl.createTexture(gl, {
					mag: gl.LINEAR,
					min: gl.LINEAR,
					src: e.target.result
				}, function(err, texture, source) {
					M.texmeta.template =
						[source.width, source.height];
					tex2bg("template");
					requestAnimationFrame(render);
				}
			);
		};
		reader.readAsDataURL(this.files[0]);
	}
});

// create framebuffers:
M.bg = twgl.createFramebufferInfo(gl); // background buffer
//M.fg = twgl.createFramebufferInfo(gl); // foreground buffer
//M.fx[0] = twgl.createFramebufferInfo(gl); // first effects buffer
//M.fx[1] = twgl.createFramebufferInfo(gl); // second effects buffer

function tex2bg(texname) {
	if(!M.textures[texname]) {
		return;
	}
	twgl.bindFramebufferInfo(gl, M.bg);
	var uniforms = {
		texture: M.textures[texname],
		sres: M.texmeta[texname],
		dres: [M.bg.width, M.bg.height]
	}
	gl.useProgram(M.sh.fit.program);
	twgl.setBuffersAndAttributes(gl, M.sh.fit, M.bufinfo);
	twgl.setUniforms(M.sh.fit, uniforms);
	twgl.drawBufferInfo(gl, gl.TRIANGLES, M.bufinfo);
}

// flatten image by committing all the brushstrokes to the background fb:
M.commit = function() {
	var bufinfo = twgl.createBufferInfoFromArrays(gl, M.arrays);

	gl.enable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	twgl.bindFramebufferInfo(gl, M.bg);
	drawfg();
	// clear the M.arrays:
	M.arrays.position.data = [];
	M.arrays.texcoord.data = [];
};

M.doclear = function() {
//	twgl.bindFramebufferInfo(gl, M.bg);
//	gl.clearColor(M.bgcolor[0], M.bgcolor[1], M.bgcolor[2], M.bgcolor[3]);
//	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT |
//						gl.STENCIL_BUFFER_BIT);
	// clear the M.arrays:
	M.arrays.position.data = [];
	M.arrays.texcoord.data = [];

	// bring back template image:
	tex2bg("template");

	requestAnimationFrame(render);
};

M.dobucket = function(pos) {
	// read pixels from background render buffer:
	var pixels = new Uint8Array(M.bg.width * M.bg.height * 4);
	twgl.bindFramebufferInfo(gl, M.bg);
	gl.readPixels(0, 0, M.bg.width, M.bg.height, gl.RGBA,
						gl.UNSIGNED_BYTE, pixels);

	// do the thing (Scanline Floodfill Algorithm With Stack):
	var pw = M.bg.width * 4; // width in terms of pixel index
	var curp = (pos[0] + M.bg.width * pos[1]) * 4; // current pixel index
	var newc = [Math.floor(M.fgcolor[0] * 255),
		Math.floor(M.fgcolor[1] * 255),
		Math.floor(M.fgcolor[2] * 255),
		Math.floor(M.fgcolor[3] * 255)]; // new color
	var oldc = [pixels[curp], pixels[curp + 1], pixels[curp + 2], 255];
	if(newc[0] == oldc[0] && newc[1] == oldc[1] && newc[2] == oldc[2]) {
		return; // same colors: nothing to do
	}
	var st = []; // stack
	var p1; // temp pos variable
	var spanAbove;
	var spanBelow;
	st.push(curp); // put current position into the stac
	while(st.length) {
		p1 = st.pop();
		// move to the left:
//			console.log(pixels[p1], pixels[p1 + 1], pixels[p1 + 2],
//				pixels[p1 + 3]);
		while(((p1 + 4) % pw > 0) && pixels[p1] == oldc[0] &&
				pixels[p1 + 1] == oldc[1] &&
				pixels[p1 + 2] == oldc[2]) {
			p1 -= 4;
		}
		p1 += 4;
		spanAbove = spanBelow = 0;
		while(((p1 + 4) % pw > 0) && pixels[p1] == oldc[0] &&
				pixels[p1 + 1] == oldc[1] &&
				pixels[p1 + 2] == oldc[2]) {
			pixels[p1] = newc[0];
			pixels[p1 + 1] = newc[1];
			pixels[p1 + 2] = newc[2];

//			console.log(p1);
			if(!spanAbove && Math.floor(p1 / pw) > 0 &&
				pixels[p1 - pw] == oldc[0] &&
				pixels[p1 - pw + 1] == oldc[1] &&
				pixels[p1 - pw + 2] == oldc[2]) {
				st.push(p1 - pw);
				spanAbove = 1;
			} else if(spanAbove && Math.floor(p1 / pw) > 0 &&
				(pixels[p1 - pw] != oldc[0] ||
				pixels[p1 - pw + 1] != oldc[1] ||
				pixels[p1 - pw + 2] != oldc[2])) {
				spanAbove = 0;
			}
			if(!spanBelow && Math.floor(p1 / pw) < (M.bg.height - 1)
				&& pixels[p1 + pw] == oldc[0] &&
				pixels[p1 + pw + 1] == oldc[1] &&
				pixels[p1 + pw + 2] == oldc[2]) {
				st.push(p1 + pw);
				spanBelow = 1;
			} else if(spanBelow && Math.floor(p1 / pw) <
					(M.bg.height - 1) &&
				(pixels[p1 + pw] == oldc[0] ||
				pixels[p1 + pw + 1] == oldc[1] ||
				pixels[p1 + pw + 2] == oldc[2])) {
				spanBelow = 0;
			}
			p1 += 4;
		}
	}

	// put pixelx back by creating a texture and calling tex2bg()
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	M.textures.temp = twgl.createTexture(gl, {
			format: gl.RGBA,
			mag: gl.NEAREST,
			min: gl.NEAREST,
			width: M.bg.width,
			src: pixels
		}
	);
	M.texmeta.temp = [M.bg.width, M.bg.height];
	tex2bg("temp");
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
	gl.deleteTexture(M.textures.temp);
	M.textures.temp = undefined;
	M.texmeta.temp = undefined;
	requestAnimationFrame(render);
};

function brushcss(radius, fgcolor, bgcolor) {
	var fcolor = "rgba(" + Math.round(fgcolor[0] * 255) + "," +
				Math.round(fgcolor[1] * 255) + "," +
				Math.round(fgcolor[2] * 255) + "," +
				Math.round(fgcolor[3]) + ") ";
	var bcolor = "rgba(" + Math.round(bgcolor[0] * 255) + "," +
				Math.round(bgcolor[1] * 255) + "," +
				Math.round(bgcolor[2] * 255) + "," +
				Math.round(bgcolor[3]) + ") ";
	return ("linear-gradient(-45deg, " +
		bcolor + "0px, " +
		bcolor + (53 - radius) + "px, " +
		fcolor + (53 - radius) + "px, " +
		fcolor  + (53 + radius) + "px, " + bcolor +
		(53 + radius) + "px, " +
		bcolor + ")");
}

function render() {
	// update picker button which also serves as an indicator of brush:
	var bcolor = "rgba(" + Math.round(M.fgcolor[0] * 255) + ", " +
				Math.round(M.fgcolor[1] * 255) + ", " +
				Math.round(M.fgcolor[2] * 255) + ", " +
				Math.round(M.fgcolor[3] * 255) + ") ";
	M.colorbtn.css("background-image", brushcss(M.brr, M.fgcolor, M.bgcolor));

	M.renderpending = false;
	// display the background:
	twgl.bindFramebufferInfo(gl, null);
	var uniforms = {
		texture: M.bg.attachments[0],
		sres: [M.bg.width, M.bg.height],
		dres: [gl.canvas.width, gl.canvas.height]
	};
	gl.useProgram(M.sh.fit.program);
	twgl.setBuffersAndAttributes(gl, M.sh.fit, M.bufinfo);
	twgl.setUniforms(M.sh.fit, uniforms);
	twgl.drawBufferInfo(gl, gl.TRIANGLES, M.bufinfo);

	// draw a brush directly to the canvas on top of the background:
	twgl.bindFramebufferInfo(gl, null);
	drawfg();
//	requestAnimationFrame(render);
}

function drawfg() {
	var bufinfo = twgl.createBufferInfoFromArrays(gl, M.arrays);

	gl.enable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	var uniforms = {};

	if(M.curtool == "eraser") {
		uniforms = {
			texture: M.textures["template"],
			sres: M.texmeta["template"],
			dres: [M.bg.width, M.bg.height]
		}
		gl.useProgram(M.sh.eraser.program);
		twgl.setBuffersAndAttributes(gl, M.sh.eraser, bufinfo);
		twgl.setUniforms(M.sh.eraser, uniforms);
	} else {
		uniforms = {
			dres: [M.bg.width, M.bg.height],
			fgcolor: M.fgcolor
		}
		gl.useProgram(M.sh.brush.program);
		twgl.setBuffersAndAttributes(gl, M.sh.brush, bufinfo);
		twgl.setUniforms(M.sh.brush, uniforms);
	}

	twgl.drawBufferInfo(gl, gl.TRIANGLES, bufinfo);
}

//requestAnimationFrame(render);

})(jQuery);
