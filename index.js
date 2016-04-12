//For writing the token to the filesystem
var fs = require('fs');

//Open browser
var open = require('open');

//Run server to do OAuth
var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

//Passport for OAuth support
var passport = require('passport');
var oauth = require('passport-oauth');
var OAuth2Strategy = oauth.OAuth2Strategy;

//Request to query API
var request = require('request');

//'Constants' (can be altered with the options bundle/init)
var BASE_URL = "http://pavlok-mvp.herokuapp.com";
var PORT = 3000;
var TOKEN_FILENAME  = __dirname + "/pavlok-token.json";
var VERBOSE = false;
var SAVE = true;
var CLIENT_ID = null;
var CLIENT_SECRET = null;
var CALLBACK_URL = null;
var ALERT_TEXT = "Sent from Node Module.";

//Shared fields
var isInited = false;
var isServer = false;
var app;

//Fields for usage as server
var successUrl = "/success";
var failureUrl = "/failure";

//Fields for usage as client
var tokenFile = null; //A representation of the token file on disk
var signingIn = null; //Are we signing in?
var code = null; //The fetched auth code

function log(msg){
    if(VERBOSE) console.log("[Pavlok API] " + msg);
}

function logErr(msg){
	console.log("[Pavlok API/Error] " + msg);
}

function createTokenFile(){
    try {
        var skeletonObject = {
            token: null
        };
		tokenFile = skeletonObject;
        fs.writeFileSync(TOKEN_FILENAME, JSON.stringify(skeletonObject, null, 2));
    } catch(e) {
        throw "Can't access disk for saving token for Pavlok API!";
    }
}

function saveTokenFile(token){
    try {
        tokenFile.token = token;    
        code = token;
        signingIn = false;
        if(SAVE) fs.writeFileSync(TOKEN_FILENAME, JSON.stringify(tokenFile, null, 2));
    } catch(e) {
        throw "Can't access disk to save Pavlok auth token!";
    }
}

function clearTokenFile(){
    try {
        tokenFile.token = null;
        code = null;
        fs.unlinkSync(TOKEN_FILENAME);
    } catch(e) {
        throw "Couldn't delete auth token!";
    }
}

//Exports
var exports = module.exports = {};

/**
  Setup the API for later use (via login, vibrate, etc.). Must be called before
  login to at least setup the client ID and client secret. 
 
  @param {String} Client ID - The OAuth2 client ID.
  @param {String} Client secret - The OAuth2 client secret.
  @param {Object} options - Custom setup options. Accepts a port ("port",
				 number), callback URL ("callbackUrl", string), a verbose 
			    debugging option ("verbose", boolean), an option to save
				the token ("save", boolean), a default value for
				alert text ("message", string), and a custom filename for 
				the token to be stored in ("tokenFile", string).
 **/
exports.init = function(cId, cSecret, options){
	if(cId !== undefined && cSecret != undefined && typeof cId == "string" 
		&& typeof cSecret == "string"){
		CLIENT_ID = cId;
		CLIENT_SECRET = cSecret;		

		if(options == undefined || typeof options != "object") options = {};

		//Fields shared between both modes
		if(options.apiUrl !== undefined && 	typeof options.apiUrl == "string")
			BASE_URL = options.apiUrl;
        
		if(options.verbose !== undefined && typeof options.verbose == "boolean")
            VERBOSE = options.verbose; 

		if(options.message !== undefined && typeof options.message == "string")
			ALERT_TEXT = options.message;

		if(options.app != undefined && typeof options.app == "object"){
			isServer = true;
			app = app;

			//Setup matching options
			if(options.callbackUrl !== undefined && typeof options.callbackUrl == "string"){
				CALLBACK_URL = options.callbackUrl;
			} else {
				logErr("callbackUrl must not be null for server apps; there is no default value!");
				return;
			}
			
			var configureSession = false;
			if(options.configureSession != undefined &&
				typeof options.configureSession == "boolean")
				configureSession = options.configureSession;

			var sessionSecret = "whywouldyouusethis";
			if(options.sessionSecret != undefined &&
				typeof options.sessionSecret == "string"){
				sessionSecret = options.sessionSecret;
			} else {
				console.log("WARNING - Pavlok is configured as a server, but " +
					"it is internally handling client token saving with a" +
					" value that's insecure!");
			}
			
			//Setup server to authenticate from the callback URL
			
		} else {
			isServer = false;
			//Setup matching fields

			//Load fields
			if(options.save != undefined && typeof options.save == "boolean")
				SAVE = options.save;

			if(options.port !== undefined && typeof options.port == "number") 
			    PORT = options.port;
			    
			CALLBACK_URL = "http://localhost:" + PORT + "/auth/pavlok/result";

			if(options.tokenFile !== undefined && typeof options.tokenFile == "string")
				TOKEN_FILE = options.tokenFile;

			//Load token file from the disk
			try {
				 tokenFile = JSON.parse(fs.readFileSync(TOKEN_FILENAME, 'utf8'));
			} catch (e) {
			    try {
					createTokenFile();
					tokenFile = JSON.parse(fs.readFileSync(TOKEN_FILENAME, 'utf8'));
				} catch (ignored) {} //Will happen on systems without file I/O access
			}

			if(tokenFile.token != null){
			    code = tokenFile.token;
			}

			//Setup app object
			app = express();
			app.use(express.static(__dirname + '/public'));
			app.use(cookieParser());
			app.use(bodyParser.json());
			
			app.get("/auth/pavlok", function(request, result){
				result.redirect(BASE_URL + "/oauth/authorize?client_id" + CLIENT_ID + "&redirect_uri=" + CALLBACK_URL + "&response_type=code"); //Redirect to Pavlok server to authorize
			});
			app.get("/auth/pavlok/result", function(request, result){ //See if there's a code in here
				if(request.query.code == null || request.query.code.length == 0){
					result.send("You've rejected the request to authenticate. Please try again.");
					return;
				}
				
				//Perform a request to /oauth/token to get the authentication token
				var address = BASE_URL + "/oauth/token";
				var queryParams = {
					code: request.query.code,
					client_id: CLIENT_ID,
					client_secret: CLIENT_SECRET,
					grant_type: "authorization_code",
					redirect_uri: CALLBACK_URL
				};

				request({
					url: address,
					qs: queryParams,
					method: 'POST'
					}, function(error, response, body){
						if(error){
							try{ 
								logErr(JSON.stringify(error)); 
							} catch (e) {}
							result.redirect("/error");
						} else {
							var codeResponse = JSON.parse(body);
							var token = codeResponse.access_token;

							code = token;
							
							//Redirect to done
							res.redirect("/done");
						}			
					});
			});
			app.get("/", function(request, result){
				result.redirect("index.html");
			});
			app.get("/done", function(request, result){
				result.redirect("done.html");
			});
			app.get("/error", function(request, result){
				result.redirect("error.html");
			});
			server = app.listen(PORT, function(){
				log("Server listening now...")
			});
		}
		
		isInited = true;
	} else {
		console.log("Invalid init params!");	
	} 
};

/**
  Login into Pavlok's API. Note that this relies on Node being able to listen
  on port 3000 (or a port passed in init), and Node being able to write to 
  ./pavlok-token.json (assuming save isn't false). If we're in server mode,
  this will fail.
  
  @param {Function} callback - Callback with two arrguments. First argument 
                               is true or false depending on success/failure,
                               and the second is the auth token on success.
 **/
exports.login = function(callback){
	if(!isInited){
		logErr("You must call pavlok.init(...) first.");
		return;
	}
	if(!isServer){
		logErr("Login is invalid when running as a server!");
		return;
	}
	if(siginingIn){
		logErr("You can't login while trying to login.");
		return;
	}
	
	if(code != null){
		log("Code loaded from disk: " + code);
		callback(true, code);
		return;
	}
	
	open("http://localhost:" + PORT + "/auth/pavlok");
};
/*

    if(CALLBACK_URL == null){
		CALLBACK_URL = "http://localhost:" + PORT + "/auth/pavlok/result";
    }

    if(code != null){
        log("Code loaded: " + code);
        callback(true, code);
        return;
    } else {
        if(SAVE) log("Unable to load code from disk; starting server...");
    }
        
    
       
    passport.use(new OAuth2Strategy({
        authorizationURL: BASE_URL + "/oauth/authorize",
        tokenURL: BASE_URL + "/oauth/token",
        clientID: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        callbackURL: CALLBACK_URL
    },
    function(token, tokenRefresh, profile, done){
        if(token != null){
            if(SAVE) log("Saving " + token + " token to disk...");
            saveTokenFile(token);
            signingIn = false;
            callback(true, token);
        } else {
            log("Token not found!");
            saveTokenFile(null);
            signingIn = false;
            callback(false, null);
        }

        return done(null, {}); //No user object checking for Pavlok's API
    }));
*/
    signingIn = true;
}

/**
  * Logout from this device. If you saved the auth token elsewhere, it
  * will still work.
  */  
exports.logout = function(){
    clearTokenFile();
}    

function genericCall(route, options){
	//Rejigger what's in opts if stuff has been omitted
	//Messy; .zap/.beep/etc. should've originally had options bundles, but
	//instead had args, leading to this mess...
	var intensityType = typeof options.intensity;
	var messageType = typeof options.message;
	var callbackType = typeof options.callback;

	if(intensityType != "undefined"){ //>= 1 opt
		if(messageType != "undefined"){ //>= 2 opts
			if(callbackType != "undefined"){ //3 opts
				//We're actually good if we have 3 opts -- no back. comp. issue
			} else { //Figure out what intensity and message _really_ are
				if(intensityType != "number"){ //A message, then
					options.callback = options.message;
					options.message = options.intensity;
					options.intensity = undefined;
				} else { //Only other bad combo is callback in message slot
					if(messageType == "function"){
						options.callback = options.message;
						options.message = undefined;
					}
				}
			}
		} else { //Just 1 opt -- figure out what it is and null all else
			var temp = options.intensity;
			options.intensity = undefined;
			options.callback = undefined;
			options.message = undefined;

			if(intensityType == "number"){
				options.intensity = temp;
			} else if (intensityType == "string"){
				options.message = temp;
			} else {
				options.callback = temp;
			}
		}
	}

    var message = ALERT_TEXT;
    if(options.message !== undefined && typeof options.message == "string"){
		message = options.message;		
    }
	var intensity = (route == "beep" ? 2 : 50);
	if(options.intensity !== undefined && typeof options.intensity == "number"){
		intensity = options.intensity;
	}
	var callback = function(res, reason){};
	if(options.callback !== undefined && typeof options.callback == "function"){
		callback = options.callback;
	}

    var address = BASE_URL + "/api/v1/stimuli/" + route + "/" + intensity;
	var queryParams = {
        access_token: code,
	    reason: message,
        time: new Date()
    };

    log("Trying to " + route + " with " + intensity + "...");
    
	//Verify parameter values
	if(signingIn){
        callback(false, "Please wait until login completes.");
        return;
    }

    if(code == null){
        callback(false, "Please login before using the API.");
        return;
    }

    if(route == "beep" && (intensity < 1 || intensity > 4)){
        callback(false, "Intensity must be between 1-4!");
        return;
    } else if (intensity < 1 || intensity > 255){
        callback(false, "Intensity must be between 1-255!");
		return;
    }

    request({
        url: address,
        qs: queryParams,
        method: 'POST',
    }, function(error, response, body){
        if(error){
            callback(false, error);
        } else {
            if (response.statusCode == 401) {
                clearTokenFile();
				code = null;
                callback(false, "Your auth token has expired!");
            } else if (response.statusCode == 200) {
                callback(true, route + " sent.");
            } else {
                callback(false, route + " returned unknown code: " + 
					response.statusCode + ".");
            }
        }
    });
}

/**
  * Beep a Pavlok.
  * @param value - The tone of beep, between 1-4.
  * @param message - The message to include with the stimuli.
  * @param callback - A callback for success, with two arguments:
                      a success boolean, and a message.
  */
exports.beep = function(value, message, callback){
    genericCall("beep", {
		intensity: value, 
		message: message, 
		callback: callback
	});
}

/**
  * Vibrate a Pavlok.
  * @param value - The intensity of vibration between 1-255.
  * @param message - The message to include with the stimuli.
  * @param callback - A callback for success, with two arguments:
                      a success boolean, and a message.
  */
exports.vibrate = function(value, message, callback){
    genericCall("vibration", {
		intensity: value,
		message: message,
		callback: callback
	});
}

/**
  * Zap with a Pavlok.
  * @param value - The intensity of zap, between 1-255.
  * @param message - The message to include with the stimuli.
  * @param callback - A callback for success, with two arguments:
                      a success boolean, and a message.
  */
exports.zap = function(value, message, callback){
    genericCall("shock", {
		intensity: value, 
		message: message, 
		callback: callback
	});
}
