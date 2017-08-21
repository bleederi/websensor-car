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

//Sliders
var slider_speed = document.getElementById("slider_speed");
var slider_speed_div = document.getElementById("slider_speed_amount");
slider_speed.onchange = () => {
        speed = slider_speed.value;
        slider_speed_div.innerHTML = speed;
        console.log("Speed:", speed);
};

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

var sensorfreq = 60;

var orientation_sensor = null;

var loopvar = null;

var mode = "portrait";
var nosensors = false;      //Flag for testing without sensors

var roll = null;
var pitch = null;
var yaw = null;

var direction = null;
var force = null;
var offroad = false;

//Rendering vars (Three.JS)
var scene = null;
var sceneSky = null;   //separate scene for the skybox

var x = 0;      //car x coordinate
var y = 0;      //car y coordinate
var speed = 0.1;        //0.1 for threeJS, 10 for Physijs

var fps           = 60;
var step          = 1/fps;                   // length of each frame in seconds
var segments = [];      //List of the parts of the road (segments)
var segmentLength = 10;    //Segment length in pixels
var roadLength = 300;   //road length in segments
var roadWidth = 5;    //Road width in pixels
var rumbleLength = 3;   //Length of a "rumble"
var curveLength = 5;    //How many segments a curve consists of
var obstacles = [];     //Array of the obstacles
var segmentMeshes = [];   //Array of the segment meshes
var carWidth = 1;

//Timer
var time=0;
var timerVar = null;

var gameview = null;

//var urlParams = null;

//PhysiJS vars
var friction = 0.3;
var restitution = 0;
var forcefactor = 15;
var mass = 10;

Physijs.scripts.worker = '/websensor-car/js/physijs_worker.js';
Physijs.scripts.ammo = 'ammo.js';

//Sensor classes and low-pass filter
//This is a sensor that uses RelativeOrientationSensor and converts the quaternion to Euler angles
class OriSensor {
        constructor() {
        this.sensor_ = new RelativeOrientationSensor({ frequency: sensorfreq });
        this.x_ = 0;
        this.y_ = 0;
        this.z_ = 0;
        this.sensor_.onreading = () => {
                let quat = this.sensor_.quaternion;
                let quaternion = new THREE.Quaternion();        //Conversion to Euler angles done in THREE.js so we have to create a THREE.js object for holding the quaternion to convert from
                let euler = new THREE.Euler( 0, 0, 0);  //Will hold the Euler angles corresponding to the quaternion
                quaternion.set(quat[0], quat[1], quat[2], quat[3]);     //x,y,z,w
                //Coordinate system must be adapted depending on orientation
                if(screen.orientation.angle === 0)      //portrait mode
                {
                euler.setFromQuaternion(quaternion, 'ZYX');     //ZYX works in portrait, ZXY in landscape
                }
                else if(screen.orientation.angle === 90 || screen.orientation.angle === 180 || screen.orientation.angle === 270)        //landscape mode
                {
                euler.setFromQuaternion(quaternion, 'ZXY');     //ZYX works in portrait, ZXY in landscape
                }
                this.x_ = euler.x;
                this.y_ = euler.y;
                this.z_ = euler.z;
                if (this.onreading_) this.onreading_();
        };
        }
        start() { this.sensor_.start(); }
        stop() { this.sensor_.stop(); }
        get x() {
                return this.x_;
        }
        get y() {
                return this.y_;
        } 
        get z() {
                return this.z_;
        }
        get longitudeInitial() {
                return this.longitudeInitial_;
        }
        set onactivate(func) {
                this.sensor_.onactivate_ = func;
        }
        set onerror(err) {
                this.sensor_.onerror_ = err;
        }
        set onreading (func) {
                this.onreading_ = func;  
        }
}

//Functions for the debug text and sliders

function updateSlider(slideAmount)
{
alert("error");
sliderDiv.innerHTML = slideAmount;
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
        switch(screen.orientation.angle) {
                default:
                case 0:
                        pitch < 0 ? direction = "left" : direction = "right";
                break;
                case 90:
                        roll < 0 ? direction = "left" : direction = "right";
                break;
                case 270:
                        roll < 0 ? direction = "left" : direction = "right";
                break;
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
                switch(screen.orientation.angle) {
                        default:
                        case 0:
                                force = Math.abs(pitch/5);
                        break;
                        case 90:
                                force = Math.abs(roll/5);
                        break;
                        case 270:
                                force = Math.abs(roll/5);
                        break;
                }
        }
        return force;
}


function move(camera, car) //Moves the car(camera)
{
        if(car !== undefined) {
                var velocity = new THREE.Vector3();
                var forcev = new THREE.Vector3();
                if(direction == "left")
                {
                        velocity = ({x: car.getLinearVelocity().x-2*force, y: car.getLinearVelocity().y, z: -speed*100});
                        forcev = {x: -forcefactor*mass*force, y: 0, z: -40*speed};
                }
                else if (direction == "right")
                {
                        velocity = ({x: car.getLinearVelocity().x+2*force, y: car.getLinearVelocity().y, z: -speed*100});
                        forcev = {x: forcefactor*mass*force, y: 0, z: -40*speed};
                }
                else
                {
                        velocity = ({x: car.getLinearVelocity().x, y: car.getLinearVelocity().y, z: -speed*100});
                        forcev = {x: 0, y: 0, z: -40*speed};
                }
                camera.position.x = car.position.x;
                camera.position.z = car.position.z + 5;
                car.setLinearVelocity(velocity);
        }
}

function isOffRoad(car)      //Determines if the car is off the road or not by checking if the car has fallen enough far down
{
        if(car.position.y < -2)
        {
                return true;
        }
        else
        {
                return false;
        }
}

function gameOver() {
        var score = time;
        //Stop game loop
        clearInterval(loopvar);
        clearInterval(timerVar);
}

function update()       //Update direction and force
{
        if(!nosensors)
        {
                direction = getDirection(roll, pitch, yaw, mode);
                force = getForce(roll, pitch, yaw, mode);
        }
}

/*      Functions related to testing without sensors      */
function keyup_handler(event) {
    if (event.keyCode == 65 || event.keyCode == 68) {
        force = 0;
        direction = "none";
    }
}

function keypress_handler(event) {
    if (event.keyCode == 65) {  //A
        direction = "left";
    }
    if (event.keyCode == 68) {
        direction = "right";
    }
        force = 0.2;
}


//The custom element where the game will be rendered
customElements.define("game-view", class extends HTMLElement {
        constructor() {
        super();

        //THREE.js render stuff
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        gameview = document.body.appendChild(this.renderer.domElement);
        
        scene = new Physijs.Scene();
        scene.setGravity(new THREE.Vector3( 0, -30, 0 ));

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 100);
        this.camera.target = new THREE.Vector3(0, 0, 0);

	this.camera.position.y = 1;
	this.camera.position.z = 2;

        this.loader = new THREE.TextureLoader();
	
        //skybox
        this.cameraSky = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 2000 );
        sceneSky = new Physijs.Scene();
	var imgFolder = "bg/";
	var directions  = ["left", "right", "top", "bot", "back", "front"];
	var imageSuffix = ".png";
	var skyGeometry = new THREE.CubeGeometry( 1000, 1000, 1000 );	
	
	var materialArray = [];
	for (var i = 0; i < 6; i++)
		materialArray.push( new THREE.MeshBasicMaterial({
			map: this.loader.load( imgFolder + directions[i] + imageSuffix ),
			side: THREE.BackSide
		}));
	//var skyMaterial = new THREE.MeshFaceMaterial( materialArray );
	var skyBox = new THREE.Mesh( skyGeometry, materialArray );
        sceneSky.add( skyBox );
        this.renderer.autoClear = false;

        //HUD
        this.hud = document.createElement('div');
        this.hud.id = "hud";
        this.hud.innerHTML = "haHAA";
        this.hud.style.left = gameview.offsetLeft + 20 + "px";
        this.hud.style.top = gameview.offsetTop + 60 + "px";
        this.hud.style.position = "absolute";
        document.body.appendChild(this.hud);

        this.carcube = null;

        window.addEventListener( 'resize', onWindowResize, false );     //On window resize, also resize canvas so it fills the screen

        function onWindowResize() {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
        }

        }

        connectedCallback() {
        //urlParams = new URLSearchParams(window.location.search);
        //nosensors = urlParams.has('nosensors'); //to specify whether or not to use sensors in the URL
                try {
                //Initialize sensors
                orientation_sensor = new OriSensor();
                orientation_sensor.onreading = () => {
                        roll = orientation_sensor.x;
                        pitch = orientation_sensor.y;
                        yaw = orientation_sensor.z;
                };
                orientation_sensor.start();
                }
                catch(err) {
                        console.log(err.message);
                        console.log("Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags.");
                        this.innerHTML = "Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags";
                        nosensors = true;
                }
                if(nosensors)
                {
                        window.addEventListener("keydown", keypress_handler, false);
                        window.addEventListener("keyup", keyup_handler, false);
                }
                this.buildRoad();
                this.drawRoad();
                this.createCar();
                this.createObstacles();
                this.render();
                timerVar=setInterval(function(){time = time + 10;},10);  //timer in ms, lowest possible value is 10, accurate enough though
                loopvar = setInterval(this.loop.bind(null, this.camera, this.carcube), step);
        }
        //Main loop
        loop(camera, carcube) {
                update();
                scene.simulate();
                move(camera, carcube);
                offroad = isOffRoad(carcube);
                if(offroad)
                {
                        console.log("Offroad");
                        gameOver();         
                }   
                speed = 0.1 + Math.abs(carcube.position.z/5000);  //increase speed bit by bit             
        }

        render() {

        //Render HUD
        this.hud.innerHTML = -Math.floor(this.carcube.position.z);
        //For some reason need to always update the position to avoid the HUD disappearing
        this.hud.style.left = gameview.offsetLeft + 20 + "px";
        this.hud.style.top = gameview.offsetTop + 60 + "px";

                this.camera.lookAt(this.carcube.position);
                // Render loop
                this.renderer.render( sceneSky, this.cameraSky );  //skybox
                this.renderer.render(scene, this.camera);
                requestAnimationFrame(() => this.render());
        }

        buildRoad() {
                let roadx = 0;  //keep track of x coordinate for curves
                for(let i=0; i<roadLength; i++)
                {
                        let segment = {"z":null, "y":null, "color":null, "type":null};
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
                        segment.y = -2;
                        segment.x = roadx;    
                        segments.push(segment);
                }
                //color the segments
                let segmentsLength = segments.length;
                for(let i=0; i<segmentsLength; i++)
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
        }

        createCurve(segmentStart, roadx, direction) {         //Creates a curve and adds it to the road
                for(let j=0; j<curveLength; j++)
                {
                        if(direction === "right") //right curve
                        {
                                let segment = {"z":null, "y":null, "color":null, "type":null};
                                segment.type = "curve";
                                segment.z = -(segmentLength*(segmentStart+j));
                                segment.y = -2;
                                segment.x = roadx;
                                segments.push(segment);
                        }
                        else
                        {
                                let segment = {"z":null, "y":null, "color":null, "type":null};
                                segment.type = "curve";
                                segment.z = -(segmentLength*(segmentStart+j));
                                segment.y = -2;
                                segment.x = roadx;
                                segments.push(segment);
                        }
                }
        }
        drawRoad() {    //Draws the road on the screen
                var geometry = new THREE.BoxGeometry( roadWidth, 2, segmentLength );
                var materialRoad = Physijs.createMaterial(
                    new THREE.MeshBasicMaterial({ color: "grey" }),
                    friction,
                    restitution
                );
                var road = new Physijs.BoxMesh(geometry, materialRoad, 0);
                let segmentsLength = segments.length;
                for (let j=0; j<segmentsLength; j++)
                {
                        let texture = this.loader.load('road.png');     //should the callback be used here?
                        let material = new THREE.MeshBasicMaterial( { map: texture } );
                        let segment = new Physijs.BoxMesh( geometry, material , 0);
                        segment.position.set(segments[j].x,segments[j].y,segments[j].z);
                                segments[j].bb = new THREE.Box3().setFromObject(segment);     //create bounding box for collision detection             
                        segmentMeshes.push(segment);
                        road.add(segment);
		        scene.add( segment );
                }
        }
        createCar() {
                var geometry = new THREE.BoxGeometry( carWidth, 1, 1 );
                var material = Physijs.createMaterial(
                    new THREE.MeshBasicMaterial({ color: "red" }),
                    friction,
                    restitution
                );
                this.carcube = new Physijs.BoxMesh( geometry, material, mass );
                this.carcube.position.set(0, 0, 0);
                this.carcube.bb = new THREE.Box3().setFromObject(this.carcube); //create bounding box for collision detection                 
	        scene.add( this.carcube );
                this.carcube.setDamping(0.1, 0.1);
                var forcev2 = {x: 0, y: 0, z: -1000*speed};
                this.carcube.applyCentralImpulse(forcev2);
        }

        createObstacles() {     //Create obstacles that the player has to avoid crashing into
                let segmentsLength = segments.length;
                let geometry = new THREE.SphereGeometry( 1, 6, 4 );
                let texture = this.loader.load('road.png');     //should the callback be used here?
                let material = new THREE.MeshBasicMaterial( { map: texture } );
                for (let i=1; i<segmentsLength; i++)   //Randomly add obstacles, at most one per segment
                {
                        let obstacle = new Physijs.SphereMesh( geometry, material , 0);
                        material.color.set(0xff0000);   //Make the obstacles stand out from the road
                        obstacle.position.z = segments[i].z;
                        obstacle.position.y = -1;
                        obstacle.position.x = segments[i].x - roadWidth/2 + roadWidth * Math.random();
                        obstacle.bb = new THREE.Box3().setFromObject(obstacle); //create bounding box for collision
                        obstacles.push(obstacle);
                        scene.add( obstacle );
                }
        }
});
