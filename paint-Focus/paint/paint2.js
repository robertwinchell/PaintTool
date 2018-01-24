// Paint module
function Paint() {
}

(function($) {
"use strict"

var M = Paint; // a shortcut for this module

M.Action = function() {
	this.cmd = 0; // where 0=keyframe, 1=erase, 2=brush, 3=fill
	this.data = {pal: 21, brr: 5}; // data to be used to execute the command
	this.prev = null; // previous action (if any)
	this.next = null; // next action (if any)
};

// Stroke class is used for brush strokes and for eraser strokes (cmd = 1 or 2)
// TODO: implement adding strokes to actions
M.Stroke = function() {
	this.pal = 0; // palette index for this stroke
	this.brr = 5; // brush radius for this stroke
	this.disk = { position: { numComponents: 2, data: [] },
		texcoord: { numComponents: 2, data: [] }};
	this.link = { position: { numComponents: 2, data: [] }};
	this.lastnode = null; // x,y coords in pixel of last node
	this.clear = function() {
		this.disk.position.data = [];
		this.disk.texcoord.data = [];
		this.link.position.data = [];
		this.lastnode = null;
	};
};

M.sh = {}; // all shaderinfo objects in one place

// brush strokes consist of array of disks and links between disks
M.stroke = {disk: { position: {
	numComponents: 2, data: [] },
	texcoord: {
	numComponents: 2, data: [] }},
	link: { position: {
	numComponents: 2, data: [] }},
	lastnode: null, // x,y coords in pixel of last node
	clear: function() {
		M.stroke.disk.position.data = [];
		M.stroke.disk.texcoord.data = [];
		M.stroke.link.position.data = [];
		M.stroke.lastnode = null;
	}
}

// array of Actions
M.firstaction = new M.Action(); // first action in the history list
M.lastaction = M.firstaction; // last action in the history list
M.curaction = M.lastaction; // current action, different when back btn pressed
M.maxkeyframes = 3; // maxumum keyframes in the history list

M.renderpending = false; // true if render already pending, reset during render

var gl = twgl.getWebGLContext(document.getElementById("c"),
	{preserveDrawingBuffer: true});
M.c = $("#c"); // canvas in jquery format
M.templatesbtn = $("#templatesbtn");
M.brushbtn = $("#brushbtn");
M.bucketbtn = $("#bucketbtn");
M.eraserbtn = $("#eraserbtn");
M.clearbtn = $("#clearbtn");
M.openbtn = $("#openbtn");
M.thickbtn = $("#thickbtn");
M.colorbtn = $("#colorbtn");
M.savebtn = $("#savebtn");
M.curpal = 21; // current palette element
M.palette = [
	// purple
	[103,51,187],	[145,95,225],	[201,171,249],
	// violet
	[155,27,176],	[201,85,220],	[235,162,247],
	// red
	[252,5,28],	[238,94,146],	[246,160,191],
	// orange
	[246,64,43],	[255,84,5],	[253,150,139],
	// yellow/gold
	[255,153,0],	[254,194,0],	[247,235,96],
	// green
	[67,174,80],	[136,196,64],	[204,221,29],
	// teal
	[0,150,135],	[60,192,179],	[133,233,223],
	// blue
	[60,77,183],	[15,147,245],	[121,209,252],
	// brown
	[121,85,71],	[187,140,122],	[253,232,169],
	// black/gray
	[0,0,0],	[157,157,157],	[255,255,255]
];
M.openbtn.addClass("tempHidden");
M.savebtn.addClass("tempHidden");

//tempHidden
M.theme = [["Animals", "animals"], ["Lifestyle", "lifestyle"],
		["Mandalas", "mandalas"], ["Mazes & <br >Themes", "mazeTheme"],
		["Nature & <br >Landscapes", "natureLand"],
		["Religious & <br >Holidays", "relandhol"]];

M.radii = [1, 2, 3, 4, 5, 8, 10, 15, 20, 30];
M.brr = 5; // brush radius in pixels
M.curtool = "brush"; // current tool, default is "brush"
M.curtheme = 0; // index of the current theme
M.curtemplate = ""; // url of the current template or empty string if none
M.backtool = ""; // tool to come back to after a template picker et c.
M.bgcolor = [1.0, 1.0, 1.0, 1.0]; // background color
M.fgcolor = [60 / 255, 77 / 255, 183 / 255, 1.0]; // foreground color

M.sh.fit = twgl.createProgramInfo(gl, ["vs_fit", "fs_fit"]); // build fit shader
M.sh.brush = twgl.createProgramInfo(gl, ["vs_brush", "fs_brush"]); // draws disk
M.sh.brlink = twgl.createProgramInfo(gl, ["vs_brlink", "fs_brlink"]); // link
M.sh.eraser = twgl.createProgramInfo(gl, ["vs_eraser", "fs_eraser"]); // eraser
M.sh.erlink = twgl.createProgramInfo(gl, ["vs_erlink", "fs_erlink"]); // er.link

// buffer to draw a square:
var arrays = {
	position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
};
M.bufinfo = twgl.createBufferInfoFromArrays(gl, arrays);

M.texmeta = {}; // width and height of each source image will be stored here
M.textures = {};

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
	M.stroke.disk.position.data.push(
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
	M.stroke.disk.texcoord.data.push(0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1);
	// add link between two disks:
	while(M.stroke.lastnode !== null) {
		var x0 = M.stroke.lastnode[0];
		var y0 = M.stroke.lastnode[1];
		var x1 = pos[0];
		var y1 = pos[1];
		var dx = x1 - x0;
		var dy = y1 - y0;
		if(Math.abs(dx) < 2 && Math.abs(dy) < 2) {
			break;
		}
		var R = Math.sqrt(dx * dx + dy * dy);
		var ox = dx * M.brr / R;
		var oy = dy * M.brr / R;
		M.stroke.link.position.data.push(
			(x0 - oy) * ratio[0],
			(y0 + ox) * ratio[1],
			(x1 - oy) * ratio[0],
			(y1 + ox) * ratio[1],
			(x1 + oy) * ratio[0],
			(y1 - ox) * ratio[1],

			(x0 - oy) * ratio[0],
			(y0 + ox) * ratio[1],
			(x1 + oy) * ratio[0],
			(y1 - ox) * ratio[1],
			(x0 + oy) * ratio[0],
			(y0 - ox) * ratio[1]
		);
		break;
	}
	M.stroke.lastnode = [pos[0], pos[1]];
};

M.ondragstart = function(e) {
	$("#pickerhinge").empty();
	M.commit();
};

M.ondragmove = function(e) {
	if(M.curtool == "bucket") {
		return;
	}
	M.addbrushnode([e.px_current_x - M.c.offset().left +
		$("html, body").scrollLeft(),
		e.px_current_y - M.c.offset().top +
		$("html, body").scrollTop()]);
	if(!M.renderpending) {
		M.renderpending = true;
		requestAnimationFrame(render);
	}
};

M.ondragend = function(e) {
	M.stroke.lastnode = null;
	if(M.curtool == "bucket") {
		M.dobucket([e.px_current_x - M.c.offset().left +
			$("html, body").scrollLeft(),
		M.bg.height - (e.px_current_y - M.c.offset().top +
			$("html, body").scrollTop())]);
		return;
	}
};

$('#c').bind('udragstart.udrag',	M.ondragstart)
	.bind('udragmove.udrag',	M.ondragmove)
	.bind('udragend.udrag',		M.ondragend);
$('#c').on('utap', function(e) {
	//e.preventDefault();
	if(M.curtool == "bucket") {
		M.dobucket([e.px_current_x - M.c.offset().left +
			$("html, body").scrollLeft(),
		M.bg.height - (e.px_current_y - M.c.offset().top +
			$("html, body").scrollTop())]);
		return;
	}
	M.commit();
	$("#pickerhinge").empty();
	M.addbrushnode([e.px_current_x - M.c.offset().left +
			$("html, body").scrollLeft(),
		e.px_current_y - M.c.offset().top +
			$("html, body").scrollTop()]);
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
	// clear the M.arrays:
	M.doclear();
//	M.stroke.clear();
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

// this function is called when a thickbtn is clicked
M.onthickchange = function() {
	M.commit();
	M.btnswitch("thick");
	var hinge = $("#pickerhinge");
	hinge.empty();
//	var div = $("<div>").attr("id", "pickerwrap").click(function() {
	var div = $("<div>").attr("id", "lineThickness").click(function() {
		M.ontemplatepick(); // close on click outside of any button
	});
	hinge.append(div);
	// create a vertical toolbar for brush thinckness buttons:
	var vtoolbar = $("<div>").addClass("vtoolbar thick");
//		.css("margin-left", "20px");
	for(var i = 0; i < 9; ++i) {
		var radius = M.radii[i];
		var bgcolor = (radius == M.brr)? [0.9, 0.9, 0.9, 1.0]:M.bgcolor;
		var btn = $("<div>").addClass("tbtn thick")
			.css("background-image",
				 brushcss(radius, M.fgcolor, bgcolor))
			.data("brr", radius)
			.click(function() {
				M.brr = 1 * $(this).data("brr");
				requestAnimationFrame(render);
			});
		vtoolbar.append(btn);
	}
	div.append(vtoolbar);
};

// this function is called when a colorbtn is clicked
M.oncolorchange = function() {
	M.commit();
	M.btnswitch("color");
	var hinge = $("#pickerhinge");
	hinge.empty();
	var div = $("<div>").attr("id", "pickerwrap").click(function() {
		M.ontemplatepick(); // close on click outside of any button
	});
	hinge.append(div);

	var q = 1 / 255;
	for(var i = 0; i < M.palette.length; ++i) {
		var color = "rgba(" + M.palette[i][0] + "," + M.palette[i][1] +
			"," + M.palette[i][2] + ",1)";
		var fgcolor = [M.palette[i][0] * q, M.palette[i][1] * q,
			M.palette[i][2] * q, 1.0];
		var btn = $("<div>").addClass("swatchbtn")
			.data("fgcolor", fgcolor) // foregroun color as floats
			.data("palind", i) // palette index
			.css("background-color", color)
			.click(M.oncolorpick);
		div.append(btn);
		if(M.curpal == i) {
			btn.html("&#x2714;");
		}
		if((i % 6) == 5) {  // (i % 5)  == 4
			div.append($("<div style='clear: both'></div>"));
		}
	}
};

// color picked, apply change:
M.oncolorpick = function() {
	var fgcolor = $(this).data("fgcolor");
	M.fgcolor = fgcolor;
	M.curpal = 1 * $(this).data("palind");
	requestAnimationFrame(render);
};

$("#newbtn").click(function() {
	M.textures["template"] = undefined;
	M.texmeta["template"] = undefined;
	M.doclear();
	$("#pickerhinge").empty()
});

M.thickbtn.click(function() {
	M.onthickchange();
});

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

//	subtoolbar.append($("<div>").addClass("closebtn")
//			.append("<div class='btntext'>X</div>"));  ca 9/27
	subtoolbar.append($("<div>").addClass("closebtn")
		.append("<div class='btntext'>Close<br />Templates</div>"));

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

$("#undobtn").click(function() {
	if(M.stroke.disk.position.data.length) {
		M.stroke.clear();
		requestAnimationFrame(render);
		return;
	}
	// find previous keyframe:
	while(M.curaction.prev) {
		M.curaction = M.curaction.prev;
		if(M.curaction.cmd === 0) {
			break;
		}
	}
	if(!M.curaction.data.tex) {
		M.textures["template"] = undefined;
		M.texmeta["template"] = undefined;
		M.doclear();
	} else {
		// set keyframe texture to the background:
		if(M.curaction.data.tex) {
			M.textures.temp = M.curaction.data.tex;
				M.texmeta.temp = M.curaction.data.texmeta;
			tex2bg("temp");
			M.textures.temp = undefined;
			M.texmeta.temp = undefined;
		}
	}
	// change color and thickness:
	M.curpal = M.curaction.data.pal;
	M.fgcolor = [M.palette[M.curpal][0] / 255, M.palette[M.curpal][1] / 255,
			M.palette[M.curpal][2] / 255, 1.0];
	M.brr = M.curaction.data.brr;
	if(!M.renderpending) {
		M.renderpending = true;
		requestAnimationFrame(render);
	}
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

$("#saveas").click(function() {
	var img = M.c[0].toDataURL("image/png")
		.replace("image/png", "image/octet-stream");
	this.href = img;
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
	gl.enable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	twgl.bindFramebufferInfo(gl, M.bg);
	drawfg();
	// clear the M.stroke:
	M.stroke.clear();
	// add keyframe action:
	M.addkeyframe();
};

// add keyframe to actions:
M.addkeyframe = function() {
	var action = new M.Action();
	action.cmd = 0; // keyframe
	action.data = {pal: M.curpal, brr: M.brr,
		tex: twgl.createTexture(gl, {
			format: gl.RGBA,
			mag: gl.NEAREST,
			min: gl.NEAREST,
			width: M.bg.width,
			src: gl.canvas
		}),
		texmeta: [M.bg.width, M.bg.height]};
	M.addaction(action);
};

// add action to action list:
M.addaction = function(action) {
	M.curaction.next = action; // link new action to the current action
	action.prev = M.curaction; // back link
	M.curaction = action; // advance current action pointer
	M.lastaction = action; // the new action becomes the last action in list
	// remove extra keyframes:
	var kfcount = M.maxkeyframes;
	var curaction = M.lastaction;
	while(curaction && kfcount) {
		if(curaction.cmd === 0) {
			--kfcount;
		}
		curaction = curaction.prev;
	}
	if(curaction && curaction.next) {
		M.firstaction = curaction.next;
		curaction.next.prev = null;
	}
	while(curaction) {
		curaction.next = null;
		curaction = curaction.prev;
	}
};

M.doclear = function() {
	// clear the M.stroke:
	M.stroke.clear();

	if(!M.textures["template"]) {
		twgl.bindFramebufferInfo(gl, M.bg);
		gl.clearColor(M.bgcolor[0], M.bgcolor[1], M.bgcolor[2],
								M.bgcolor[3]);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT |
						gl.STENCIL_BUFFER_BIT);
	} else {
		// bring back template image:
		tex2bg("template");
	}

	requestAnimationFrame(render);
};

// returns true if similar colors
function sc(c0, c1, o0, o1) {
	var lambda = 5; // plus or minus lambda comsidered same color
	o0 = o0? o0: 0;
	o1 = o1? o1: 0;
	if(Math.abs(c0[o0 + 0] - c1[o1 + 0]) < lambda &&
		Math.abs(c0[o0 + 1] - c1[o1 + 1]) < lambda &&
		Math.abs(c0[o0 + 2] - c1[o1 + 2]) < lambda &&
		Math.abs(c0[o0 + 3] - c1[o1 + 3]) < lambda) {
		return true;
	}
	return false;
}

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
	var oldc = [pixels[curp], pixels[curp + 1], pixels[curp + 2],
			pixels[curp + 3]];
	if(sc(newc, oldc)) {
		return; // same colors: nothing to do
	}
	var st = []; // stack
	var p1; // temp pos variable
	var spanAbove;
	var spanBelow;
	st.push(curp); // put current position into the stack
	while(st.length) {
		p1 = st.pop();
		// move to the left:
//			console.log(pixels[p1], pixels[p1 + 1], pixels[p1 + 2],
//				pixels[p1 + 3]);
		while(((p1 + 4) % pw > 0) && sc(pixels, oldc, p1)) {
			p1 -= 4;
		}
		p1 += 4;
		spanAbove = spanBelow = 0;
		while(((p1 + 4) % pw > 0) && sc(pixels, oldc, p1)) {
			pixels[p1] = newc[0];
			pixels[p1 + 1] = newc[1];
			pixels[p1 + 2] = newc[2];
			pixels[p1 + 3] = newc[3];

			if(!spanAbove && Math.floor(p1 / pw) > 0 &&
				sc(pixels, oldc, p1 - pw)) {
				st.push(p1 - pw);
				spanAbove = 1;
			} else if(spanAbove && Math.floor(p1 / pw) > 0 &&
				!sc(pixels, oldc, p1 - pw)) {
				spanAbove = 0;
			}
			if(!spanBelow && Math.floor(p1 / pw) < (M.bg.height - 1)
				&& sc(pixels, oldc, p1 + pw)) {
				st.push(p1 + pw);
				spanBelow = 1;
			} else if(spanBelow && Math.floor(p1 / pw) <
							(M.bg.height - 1) &&
				!sc(pixels, oldc, p1 + pw)) {
				spanBelow = 0;
			}
			p1 += 4;
		}
	}

	// put pixels back by creating a texture and calling tex2bg()
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

	// add new action to the actions list
	var action = new M.Action();
	action.cmd = 0; // keyframe
	action.data = {pal: M.curpal, brr: M.brr,
		tex: twgl.createTexture(gl, {
			format: gl.RGBA,
			mag: gl.NEAREST,
			min: gl.NEAREST,
			width: M.bg.width,
			src: pixels
		}),
		texmeta: [M.bg.width, M.bg.height]};
	M.addaction(action);

	M.textures.temp = action.data.tex;
	M.texmeta.temp = action.data.texmeta;
	tex2bg("temp");
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
	//gl.deleteTexture(M.textures.temp);
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
				           Math.round(bgcolor[3] * 0.0) + ") ";
    // ca 9/27 was -45deg
	return ("linear-gradient(90deg, " +
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

	M.thickbtn.css(
		"background-image", brushcss(M.brr, M.fgcolor, M.bgcolor));
//		"background-image", brushcss(M.brr, M.fgcolor, M.bgcolor));
	M.colorbtn.css({"background-color": bcolor,
		"background-image": "none"});

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
	var bufinfo = twgl.createBufferInfoFromArrays(gl, M.stroke.disk);
	var buflink = twgl.createBufferInfoFromArrays(gl, M.stroke.link);

	gl.enable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	var uniforms = {};

	if(M.curtool == "eraser") {
		uniforms = {
			dres: [M.bg.width, M.bg.height]
		}
		if(M.texmeta["template"]) {
			uniforms.sres = M.texmeta["template"];
			uniforms.texture = M.textures["template"];
		}
		gl.useProgram(M.sh.eraser.program);
		twgl.setBuffersAndAttributes(gl, M.sh.eraser, bufinfo);
		twgl.setUniforms(M.sh.eraser, uniforms);

		twgl.drawBufferInfo(gl, gl.TRIANGLES, bufinfo);

		gl.useProgram(M.sh.erlink.program);
		twgl.setBuffersAndAttributes(gl, M.sh.erlink, buflink);
		twgl.setUniforms(M.sh.erlink, uniforms);
		twgl.drawBufferInfo(gl, gl.TRIANGLES, buflink);
	} else {
		uniforms = {
			dres: [M.bg.width, M.bg.height],
			fgcolor: M.fgcolor
		}
		gl.useProgram(M.sh.brush.program);
		twgl.setBuffersAndAttributes(gl, M.sh.brush, bufinfo);
		twgl.setUniforms(M.sh.brush, uniforms);

		twgl.drawBufferInfo(gl, gl.TRIANGLES, bufinfo);

		gl.useProgram(M.sh.brlink.program);
		twgl.setBuffersAndAttributes(gl, M.sh.brlink, buflink);
		twgl.setUniforms(M.sh.brlink, uniforms);
		twgl.drawBufferInfo(gl, gl.TRIANGLES, buflink);
	}

}

requestAnimationFrame(render);

})(jQuery);
