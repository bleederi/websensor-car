/*
 * Websensor Car Game
 * https://github.com/jessenie-intel/websensor-car
 *
 * Copyright (c) 2017 Jesse Nieminen
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.

*/
'use strict';

/* Globals */
var xcoord_div = document.getElementById("xcoord");
var ycoord_div = document.getElementById("ycoord");
var roll_div = document.getElementById("roll");
var pitch_div = document.getElementById("pitch");
var yaw_div = document.getElementById("yaw");
var direction_div = document.getElementById("direction");
var force_div = document.getElementById("force");
var ut; //debug text update var
var mv; //movement update var

var canvas = document.getElementById("canvas");
//resize canvas to fullscreen
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
var ctx = canvas.getContext("2d");

var latitude = null;
var longitude = null;
const GRAVITY = 9.81;
var orientationMat = new Float64Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);     //device orientation
var sensorfreq = 60;

var orientation_sensor = null;

var loopvar = null;

var mode = "portrait";
var nosensors = 0;      //Flag for testing without sensors

var roll = null;
var pitch = null;
var yaw = null;

var direction = null;
var force = null;

var ballRadius = 5;
var roadblockHeight = 100;
var roadblockWidthInitial = 200;

//Rendering vars (Three.JS)
var scene = null;
var sphere = null;
var video = null;
var videoF = null;
var videoB = null;
var videoTexture = null;
var sphereMaterial = null;
var sphereMesh = null;

var x = 0;      //car x coordinate
var y = 0;      //car y coordinate
var speed = 5;
var angle = 0;
var mod = 0;

var fps           = 60;
var step          = 1/fps;                   // length of each frame in seconds
var segments = [];      //List of the parts of the road (segments)
var segmentLength = 10;    //Segment length in pixels
var roadLength = 300;   //road length in segments
var roadLength2D = canvas.height/segmentLength;   //road length in segments
var roadWidth = 5;    //Road width in pixels
var roadWidth2D = 0.3*canvas.width;
var rumbleLength = 3;   //Length of a "rumble"
var curveLength = 5;    //How many segments a curve consists of

//Camera vars
var cameraHeight = 1000;

//Timer
var time=0;
var timer=setInterval(function(){timer++;},1000); 

//Sensor classes and low-pass filter
class AbsOriSensor {
        constructor() {
        const sensor = new AbsoluteOrientationSensor({ frequency: sensorfreq });
        const mat4 = new Float32Array(16);
        const euler = new Float32Array(3);
        sensor.onchange = () => {
                sensor.populateMatrix(mat4);
                toEulerianAngle(sensor.quaternion, euler);      //From quaternion to Eulerian angles
                this.roll = euler[0];
                this.pitch = euler[1];
                this.yaw = euler[2];
                if (this.onchange) this.onchange();
        };
        sensor.onactivate = () => {
                if (this.onactivate) this.onactivate();
        };
        const start = () => sensor.start();
        Object.assign(this, { start });
        }
}
class LowPassFilterData {       //https://w3c.github.io/motion-sensors/#pass-filters
  constructor(reading, bias) {
    Object.assign(this, { x: reading.x, y: reading.y, z: reading.z });
    this.bias = bias;
  }
        update(reading) {
                this.x = this.x * this.bias + reading.x * (1 - this.bias);
                this.y = this.y * this.bias + reading.y * (1 - this.bias);
                this.z = this.z * this.bias + reading.z * (1 - this.bias);
        }
}

//WINDOWS 10 HAS DIFFERENT CONVENTION: Yaw z, pitch x, roll y
function toEulerianAngle(quat, out)
{
        const ysqr = quat[1] ** 2;

        // Roll (x-axis rotation).
        const t0 = 2 * (quat[3] * quat[0] + quat[1] * quat[2]);
        const t1 = 1 - 2 * (ysqr + quat[0] ** 2);
        out[0] = Math.atan2(t0, t1);
        // Pitch (y-axis rotation).
        let t2 = 2 * (quat[3] * quat[1] - quat[2] * quat[0]);
        t2 = t2 > 1 ? 1 : t2;
        t2 = t2 < -1 ? -1 : t2;
        out[1] = Math.asin(t2);
        // Yaw (z-axis rotation).
        const t3 = 2 * (quat[3] * quat[2] + quat[0] * quat[1]);
        const t4 = 1 - 2 * (ysqr + quat[2] ** 2);
        out[2] = Math.atan2(t3, t4);
        return out;
}

function updateText()   //For updating debug text
{
        roll_div.innerHTML = roll;
        pitch_div.innerHTML = pitch;
        yaw_div.innerHTML = yaw;
        direction_div.innerHTML = direction;
        force_div.innerHTML = force;
        xcoord_div.innerHTML = x;
        ycoord_div.innerHTML = y;
}

function getDirection(roll, pitch, yaw, mode="landscape")    //Returns the direction the car is turning towards
{
        if(mode == "landscape")
        {
                direction = "todo";
        }
        else
        {
                if(pitch < 0)
                {       
                        direction = "left";
                }
                else
                {
                        direction = "right";
                }
        }
        return direction;
}

function getForce(roll, pitch, yaw, mode="landscape")    //Returns the force the car will be turning with
{
        if(mode == "landscape")
        {
                direction = "todo";
        }
        else
        {
                if(pitch < 0)
                {       
                        force = -pitch/10;
                }
                else
                {
                        force = pitch/10;
                }
        }
        return force;
}

function move2D() //Moves the car
{
        if(direction == "left")
        {
                x = x - force;
        }
        else if (direction == "right")
        {
                x = x + force;
        }
}

function move(camera, car) //Moves the car(camera)
{
        if(car !== undefined) {
                //console.log("cc2", car);
                speed = 0.05;
                if(direction == "left")
                {
                        camera.position.x = camera.position.x - force;
                        car.position.x = car.position.x - force;
                }
                else if (direction == "right")
                {
                        camera.position.x = camera.position.x + force;
                        car.position.x = car.position.x + force;
                }
                camera.position.z = camera.position.z - speed;
                car.position.z = car.position.z - speed;
        }
}

function drawCar2D() 
{
        ctx.beginPath();
        ctx.arc(x, y, ballRadius, 0, Math.PI*2);
        ctx.fillStyle = "#0095DD";
        ctx.fill();
        ctx.closePath();
}

function buildRoad2D()    //Generates the road segments, updates them as needed by "moving" the road
{
        if(segments.length === 0)       //Generate the road segments
        {
                for(let i=0; i<roadLength2D; i++)
                {
                        if(i%rumbleLength === 0)
                        {
                            segments.push({"color":"black"});
                        }
                        else
                        {
                            segments.push({"color":"grey"});
                        }        
                }
        }
        else
        {
                segments.unshift(segments.pop());       //Shift the segments, updating the road
        }
}
function drawRoad2D()     //Draw the road and the rumble strips
{
        //TODO: Draw a curvy, random road
        //Draw a rumble - This is for 2D
        for (let j=0; j<segments.length; j++)
        {
                let xc = (j/segments.length)*roadWidth2D;
                ctx.beginPath();
                ctx.rect(canvas.width/2-xc,j*segmentLength,2*xc,roadblockHeight);     //road
                ctx.fillStyle = segments[j].color;               
                ctx.fill();

                ctx.beginPath();
                ctx.rect(canvas.width/2+xc,j*segmentLength,xc/2,(xc/100)*roadblockHeight);       //right rumble strip
                ctx.fillStyle = "red";        
                ctx.fill();
                
                ctx.beginPath();
                ctx.rect(canvas.width/2-xc,j*segmentLength,-xc/2,(xc/100)*roadblockHeight);       //right rumble strip
                ctx.fillStyle = "red";               
                ctx.fill();
                ctx.closePath(); 
        }
}

function isOffRoad(x)      //Determines if the car is off the road or not by checking the pixel the car is on
{
/*      2D
        //TODO: Inspect pixels instead?
        if(x > canvas.width/2 + roadWidth/2 || x < canvas.width/2-roadWidth/2)
        {
            return 1;   //off the road
        }
        else
        {
            return 0;   //on the road
        }
*/
        if(x > roadWidth/2 || x < -roadWidth/2)
        {
            return 1;   //off the road
        }
        else
        {
            return 0;   //on the road
        }
}

function update()       //Update vars, move the car accordingly
{
        direction = getDirection(roll, pitch, yaw, mode);
        force = getForce(roll, pitch, yaw, mode);
        move();
}

/*      Functions related to testing without sensors      */
function keyup_handler(event) {
    if (event.keyCode == 65 || event.keyCode == 68) {
        force = 0;
        direction = "none";
    }
}

function keypress_handler(event) {
    console.log(event.keyCode);
    if (event.keyCode == 65) {  //A
        direction = "left";
    }
    if (event.keyCode == 68) {
        direction = "right";
    }
        force = 0.05;
}

function distanceFromAtoB(position1,x2,y2,z2) {  //get position distance from specified point
    var distance = new THREE.Vector3();
    var target = new THREE.Vector3(x2,y2,z2);
    distance.subVectors(position1, target);
    return distance.length();
};


function updateNS()       //Update vars, move the car accordingly (no sensors)
{
                force = 0.05;
                move2D();
}


//The custom element where the game will be rendered
customElements.define("game-view", class extends HTMLElement {
        constructor() {
        super();

        //THREE.js render stuff
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 200);
        this.camera.target = new THREE.Vector3(0, 0, 0);

	this.camera.position.y = 1;
	this.camera.position.z = 2;

        //sphere = new THREE.SphereGeometry(100, 100, 40);
        //sphere.applyMatrix(new THREE.Matrix4().makeScale(-1, 1, 1));

        //videoTexture = new THREE.Texture(video);
        //videoTexture.minFilter = THREE.LinearFilter;
        //videoTexture.magFilter = THREE.LinearFilter;
        //videoTexture.format = THREE.RGBFormat;

        //sphereMaterial = new THREE.MeshBasicMaterial( { map: videoTexture, overdraw: 0.5 } );
        //sphereMesh = new THREE.Mesh(sphere, sphereMaterial);
        //scene.add(sphereMesh);

        this.carcube = null;
        }

        connectedCallback() {
                try {
                //Initialize sensors
                orientation_sensor = new AbsOriSensor();
                orientation_sensor.onchange = () => {
                        roll = orientation_sensor.roll;
                        pitch = orientation_sensor.pitch;
                        yaw = orientation_sensor.yaw;
                };
                orientation_sensor.onactivate = () => {
                };
                orientation_sensor.start();
                }
                catch(err) {
                        console.log(err.message);
                        console.log("Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags.");
                        this.innerHTML = "Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags";
                }
                //place car - 2D
                //x = canvas.width/2;   //2D
                //y = canvas.height - ballRadius;       //2D
                x = 0;
                y = 0;
                if(!nosensors)
                {
                        ut = setInterval(updateText, 1000);
                        mv = setInterval(update, 100);
                }
                else
                {
                        mv = setInterval(updateNS, 100);
                        window.addEventListener("keydown", keypress_handler, false);
                        window.addEventListener("keyup", keyup_handler, false);
                }
                //Update the road
                //var rb = setInterval(buildRoad2D, 1000/speed);  //2D
                this.buildRoad();
                //console.log(segments);
                this.drawRoad();
                this.createCar();
                this.createObstacles();
                this.render();
                loopvar = setInterval(this.loop.bind(null, this.camera, this.carcube), step);
        }
        //Main loop
        loop(camera, carcube) {
                //console.log("cc", carcube);
                move(camera, carcube);
                var or = isOffRoad(camera.position.x);
                //console.log(or);
                //camera.position.x = camera.position.x + 0.1;
                //console.log("loop");
        }

        render() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                //console.log(segments);
                //Need to draw road before the car               
                drawRoad2D();     //for 2D
                drawCar2D();
                
                //Rotate cube
	        //cube.rotation.x += 0.1;
	        //cube.rotation.y += 0.1;

                this.camera.lookAt(this.carcube.position);
                // Render loop
                this.renderer.render(scene, this.camera);
                requestAnimationFrame(() => this.render());
        }

        buildRoad() {
                let roadx = 0;  //keep track of x coordinate for curves
                for(let i=0; i<roadLength; i++)
                {
                        let segment = {"z":null, "y":null, "color":null, "type":null};
                        //TODO: Generate curves somehow
                        if(Math.random() > 0.1)      //add condition for curve here
                        {
                                if(Math.random() > 0.5) //right curve
                                {
                                        this.createCurve(i, roadx, "right");
                                        roadx = roadx + roadWidth;
                                }
                                else    //left curve
                                {
                                        this.createCurve(i, roadx, "left");
                                        roadx = roadx - roadWidth;                                
                                }
                                i = i + curveLength-1;  //push the index forward
                        }
                        else
                        {
                                segment.type = "straight";
                        }
                        segment.z = -(segmentLength*i);
                        //console.log(segment.z);
                        segment.y = -2;
                        segment.x = roadx;    
                        segments.push(segment);
                }
                //color the segments
                for(let i=0; i<segments.length; i++)
                {
                        if(i%rumbleLength === 0)
                        {
                                segments[i].color = "white";
                        }
                        else
                        {
                                segments[i].color = "grey";
                        }
                }
                //segments.sort((a,b) => parseInt(Math.abs(a.z))-parseInt(Math.abs(b.z)));  //sort the segments according to z coordinate
                //console.log("sort");
                //console.log(segments);
        }

        createCurve(segmentStart, roadx, direction) {         //Creates a curve and adds it to the road
                for(let j=0; j<curveLength; j++)
                {
                        if(direction === "right") //right curve
                        {
                                let segment = {"z":null, "y":null, "color":null, "type":null};
                                segment.type = "curve";
                                //segment.color = "green";
                                segment.z = -(segmentLength*(segmentStart+j));
                                segment.y = -2;
                                segment.x = roadx;
                                //roadx = roadx = 1;
                                segments.push(segment);
                        }
                        else
                        {
                                let segment = {"z":null, "y":null, "color":null, "type":null};
                                segment.type = "curve";
                                //segment.color = "green";
                                segment.z = -(segmentLength*(segmentStart+j));
                                segment.y = -2;
                                segment.x = roadx;
                                //roadx = roadx = 1;
                                segments.push(segment);
                        }
                }
        }
        drawRoad() {    //Draws the road on the screen
                var geometry = new THREE.BoxGeometry( roadWidth, 2, segmentLength );
                for (let j=0; j<segments.length; j++)
                {
                        let material = new THREE.MeshBasicMaterial( { color: segments[j].color} );
        		let segment = new THREE.Mesh( geometry, material );
                        //cube.position.z = -(roadLength/segmentLength)*j;
                        //console.log(cube.position.z);                        
                        segment.position.z = segments[j].z;      //Lagging for some reason, should fix
                        //console.log(segment.position.z);
                        segment.position.x = segments[j].x;
                        segment.position.y = segments[j].y;
                        if(segment.bb === undefined)    //compute bounding boxes only once
                        {
                                segments[j].bb = new THREE.Box3().setFromObject(segment);     //create bounding box for collision detection             
                        }
		        scene.add( segment );
                }
        }
        createCar() {
                var geometry = new THREE.BoxGeometry( 1, 1, 1 );
                var material = new THREE.MeshBasicMaterial( { color: "red"} );
		this.carcube = new THREE.Mesh( geometry, material );
                this.carcube.position.z = 0;
                this.carcube.position.y = 0;
                this.carcube.bb = new THREE.Box3().setFromObject(this.carcube); //create bounding box for collision detection                 
	        scene.add( this.carcube );
        }

        createObstacles() {     //Create obstacles that the player has to avoid crashing into
                for (let i=0; i<segments.length; i++)   //Randomly add obstacles, at most one per segment
                {
                        var geometry = new THREE.BoxGeometry( 0.5, 1, 0.5 );
                        var material = new THREE.MeshBasicMaterial( { color: "blue"} );
		        var obstacle = new THREE.Mesh( geometry, material );
                        obstacle.position.z = segments[i].z;
                        obstacle.position.y = -0.5;
                        obstacle.position.x = segments[i].x - roadWidth/2 + roadWidth * Math.random();      //TODO:make random
                        scene.add( obstacle );
                }
        }

});

function magnitude(vector)      //Calculate the magnitude of a vector
{
return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}
