const color = require("bash-color");

const SOURCE_ENVS = "ENVS";
const SOURCE_ARGS = "ARGS";
const ENV_PREFIX = "NODE_CONFIG_";

/**
 * simple config version validation:
 *
 * - returns nothing if no versions given or versions match
 * - throws an error on version mismatch
 *
 * @param config {Object}
 * @param envConfigVersion {number}
 */
function validateConfigVersion(config, envConfigVersion) {
    // any version set? if not: no config versioning required, everything is fine
    if(!config.hasOwnProperty("configVersion") && !envConfigVersion) {
        return;
    }

    if(!config.configVersion) {
        throw new Error("config has no version, but NODE_CONFIG_CONFIGVERSION given: please update your image.")
    }

    if(!envConfigVersion) {
        throw new Error("no NODE_CONFIG_CONFIGVERSION given, but configVersion set in configuration: please update your deployment.")
    }

    // (simple) comparisons via "<" ">" fail for strings, e.g.: "11" < "3"…
    // so lets restrict usage to numbers only
    if(typeof config.configVersion !== "number") {
        throw new Error("configVersion must be a number. Using timestamps as configVersion is strongly suggested.");
    }

    if(config.configVersion < envConfigVersion) {
        throw new Error("NODE_CONFIG_CONFIGVERSION newer than configVersion: please update your image.")
    }

    if(envConfigVersion < config.configVersion) {
        throw new Error("NODE_CONFIG_CONFIGVERSION outdated: please update your deployment.");
    }
}

//initialize with a config object e.g. const dc = Object.create(DockerConfig, config({}));
function DockerConfig(){}

DockerConfig.prototype.init = function(){
    this._overwriteWithEnvironmentVars();
};

DockerConfig.prototype._overwriteWithEnvironmentVars = function(){

    var envs = process.env;
    envs = Object.keys(envs);

    if(!envs ||envs.length <= 0){
        return this._println("[" + SOURCE_ENVS + "] -> No environment variables found wont overwrite config file values.");
    }

    var env = "";
    var enva = ["", ""];
    for(var i = 0; i < envs.length; i++){

        env = envs[i];

        if(process.env.hasOwnProperty(env)){

            if(env.indexOf(ENV_PREFIX) !== -1){

                enva = env.split(ENV_PREFIX);
                if(enva.length !== 2){
                    this._println("[" + SOURCE_ENVS + "] -> variable key " + env + " has a bad format.");
                    continue;
                }

                env = enva[1].toLowerCase(); // turns "NODE_CONF_DATABASE_CONSTRING" into "database_constring"
                env = env.replace(/_/g, '.');

                var _ref = this._getRef(this, env);
                if(!env || typeof _ref === "undefined"){
                    this._println("[" + SOURCE_ENVS + "] -> variable key " + env + " does not exist in the config file, it will be skipped.");
                    continue;
                }

                var valuePure = process.env[envs[i]];
                var value = valuePure;
                if(typeof valuePure === "string"){
                    try {
                        value = JSON.parse(valuePure);
                    } catch(ex){
                        //silent
                    }
                }

                this._println(this._getArgsOutput(SOURCE_ENVS, env, this._getRef(this, env), value));
                this._setRef(this, env, value);
            }
        }
    }
};

DockerConfig.prototype._getRef = function(o, s){

    s = s.replace(/\[(\w+)\]/g, '.$1'); // convert indexes to properties
    s = s.replace(/^\./, '');           // strip a leading dot
    var a = s.split('.');

    for (var i = 0, n = a.length; i < n; ++i) {
        var k = a[i];

        const ciO = Object.keys(o).map(k => [k, k.toLowerCase(), o[k]]);
        let prop = ciO.find(([key, lcK, prop]) => lcK === k);
        if(prop) {
            o = prop[2];
        } else {
            return;
        }
    }

    return o;
};

DockerConfig.prototype._setRef = function(obj, prop, value){
    if (typeof prop === "string"){
        prop = prop.split(".");
    }

    if (prop.length > 1) {
        var e = prop.shift();
        this._setRef(obj[e] =
                Object.prototype.toString.call(obj[e]) === "[object Object]"
                    ? obj[e]
                    : {},
            prop,
            value);
    } else {
        const key = Object.keys(obj).map(key => [key, key.toLowerCase()]).find(([key, lcKey]) => lcKey === prop[0]);
        if(key) {
            obj[key[0]] = value;
        }
    }
};

DockerConfig.prototype._getArgsOutput = function(source, name, oldContent, newContent){

    oldContent = typeof oldContent === "object" ? JSON.stringify(oldContent) : oldContent;
    //newContent = typeof  newContent === "object" ? JSON.stringify(newContent) : newContent;

    return "|" + source + "| -> variable [" + name + "] set, overwriting [" + oldContent + "] with [new content..(secret)]";
};

DockerConfig.prototype._println = function(str){

    if(typeof str !== "string") {
        str = JSON.stringify(str, null, 1);
    }

    console.log(color.purple(str, true));
};

DockerConfig.prototype.makeGlobal = function(){
    global.CONFIG = this;
};

//static
DockerConfig.getConfig = function(obj){
    validateConfigVersion(obj, process.env["NODE_CONFIG_CONFIGVERSION"]);
    const config = Object.assign(new DockerConfig(), obj);
    config.init();
    return config;
};

module.exports = DockerConfig;
