/**
 * (c) 2018 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 cepharum GmbH
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * @author: cepharum
 */

"use strict";

const { posix: Path } = require( "path" );
const HTTP = require( "http" );
const HTTPS = require( "https" );
const URL = require( "url" );



const defaultAgentOptions = {
	keepAlive: true,
};


/**
 * Declares blueprint route for every configuration of a proxy.
 *
 * @param {object} options Hitchy runtime options
 * @returns {Map<string, function>} maps from routes in functions handling requests for either route
 */
exports.blueprints = function( options ) { // eslint-disable-line no-unused-vars
	const { runtime: { config: { proxy: proxies } }, log } = this;

	const routes = new Map();
	const reverseMap = {};
	const Debug = log( "hitchy:proxy" );


	if ( Array.isArray( proxies ) ) {
		const numProxies = proxies.length;

		Debug( "found configuration for %d reverse proxies", numProxies );

		for ( let i = 0; i < numProxies; i++ ) {
			const proxy = proxies[i] || {};
			const { prefix, target } = proxy;

			if ( prefix && target ) {
				const parsed = URL.parse( target );
				if ( parsed.hostname ) {
					const agentOptions = Object.assign( {}, defaultAgentOptions, proxy.agentOptions );
					const context = {
						prefix: prefix,
					};

					if ( parsed.protocol === "https:" ) {
						context.library = HTTPS;
						context.agent = new HTTPS.Agent( agentOptions );
						context.defaultPort = 443;
					} else {
						context.library = HTTP;
						context.agent = new HTTP.Agent( agentOptions );
						context.defaultPort = 80;
					}

					const url = {
						protocol: parsed.protocol,
						host: parsed.hostname,
						port: parsed.port || context.defaultPort,
						path: parsed.pathname,
					};

					const href = `${url.protocol}//${url.host}:${url.port}${url.path}`;

					if ( !reverseMap.hasOwnProperty( href ) ) {
						Debug( "- forwarding %s to %s", prefix, href );

						const proxyHandler = createProxy.call( { Debug }, context, url, proxy, reverseMap );

						routes.set( Path.join( prefix, "/:route*" ), proxyHandler );

						reverseMap[href] = prefix;
					}
				}
			}
		}
	}

	return routes;
};

/**
 * Generates request handler forwarding requests to some remote target.
 *
 * @param {string} prefix local URL prefix addressing proxy to be created
 * @param {object} backend parsed properties in base URL of proxy's remote target
 * @param {object} config configuration of proxy to be created
 * @param {object<string,string>} reverseMap maps from a target's absolute URL back to the prefix of related reverse proxy
 * @param {object} library set of methods to use on sending HTTP requests as a client
 * @param {Agent} agent HTTP agent to use on forwarding requests to defined target
 * @param {int} defaultPort default port to use with requests of provided library
 * @returns {function(req:IncomingMessage,res:ServerResponse):void} generated request handler
 * @this {{Debug:{log:function(string,...)}}}
 */
function createProxy( { prefix, library, agent, defaultPort }, backend, config, reverseMap ) {
	const { hideHeaders = [], timeout = 5000 } = config;
	const { Debug } = this;

	return ( req, res ) => {
		const { route } = req.params;

		// prevent client from relatively addressing URL beyond scope of current proxy's prefix
		const pathname = Path.resolve( backend.path, ...route || [] );
		if ( pathname.indexOf( backend.path ) !== 0 ) {
			Debug( "invalid path name: %s", route.join( "/" ) );

			res.status( 400 ).send( "invalid path name" );

			return;
		}


		// compile current request's query back into single string
		const queryNames = Object.keys( req.query );
		const numNames = queryNames.length;
		const query = new Array( numNames );
		for ( let i = 0; i < numNames; i++ ) {
			const name = queryNames[i];

			query[i] = encodeURIComponent( name ) + "=" + encodeURIComponent( req.query[name] );
		}


		// make a (probably reduced) copy of all incoming request headers
		const copiedHeaders = {};
		{
			const source = req.headers;
			const keys = Object.keys( source );
			const numKeys = keys.length;
			for ( let i = 0; i < numKeys; i++ ) {
				const key = keys[i];

				switch ( key ) {
					case "host" :
						// never pass these headers
						break;

					default :
						if ( hideHeaders.indexOf( key ) > -1 ) {
							// configuration rejects to pass this header
							break;
						}

						copiedHeaders[key] = source[key];
				}
			}
		}


		// create local client forwarding request to remote target
		const proxyOptions = {
			protocol: backend.protocol,
			host: backend.host,
			port: backend.port,
			method: req.method,
			path: pathname + ( query.length > 0 ? "?" + query.join( "&" ) : "" ),
			headers: copiedHeaders,
			timeout: timeout,
			agent: agent,
		};

		Debug( "forward request is %s %s//%s:%d%s with headers: %o timeout: %d",
			proxyOptions.method, proxyOptions.protocol, proxyOptions.host,
			proxyOptions.port, proxyOptions.path, proxyOptions.headers,
			proxyOptions.timeout );

		const proxyReq = library.request( proxyOptions, proxyRes => {
			Debug( "response is %d %o", proxyRes.statusCode, proxyOptions.headers );

			res.statusCode = proxyRes.statusCode;

			// process and forward response headers sent by backend
			const source = proxyRes.headers;
			const keys = Object.keys( source );
			const numKeys = keys.length;

			for ( let i = 0; i < numKeys; i++ ) {
				const key = keys[i];

				switch ( key ) {
					case "location" : {
						const value = source[key];
						const translated = translateBackendUrl( prefix, route, value );

						Debug( "translating %s to %s", value, translated );
						res.setHeader( "Location", translated );

						break;
					}

					default :
						res.setHeader( key, source[key] );
				}
			}

			proxyRes.pipe( res );
		} );

		proxyReq.on( "error", error => {
			Debug( "forward request failed with: %s", error.message );

			res
				.status( 502 )
				.set( "x-error", error.message )
				.json( {
					error: error.message,
				} );
		} );

		req.pipe( proxyReq );
	};

	/**
	 * Translates URL provided by backend into URL for the proxy's client
	 * addressing the same resource via the proxy.
	 *
	 * @param {string} proxyPrefix URL prefix of current proxy
	 * @param {string[]} current segments of currently processed route in scope of proxy's prefix
	 * @param {string} backendUrl URL provided for backend to be translated
	 * @return {string} translated URL addressing same resource for use by proxy's client
	 */
	function translateBackendUrl( proxyPrefix, current, backendUrl ) {
		const url = URL.parse( backendUrl );
		if ( url.host ) {
			// handle redirection to absolute URL
			const href = `${url.protocol}//${url.hostname}:${url.port || defaultPort}${url.path || ""}${url.hash || ""}`;


			// find proxy with longest prefix matching redirection target
			let match = null;
			const sources = Object.keys( reverseMap );
			const numSources = sources.length;

			for ( let i = 0; i < numSources; i++ ) {
				const source = sources[i];

				if ( href.indexOf( source ) === 0 && href[source.length].match( /$|[/?#&]/ ) ) {
					if ( match == null || source.length > match.length ) {
						match = source;
					}
				}
			}

			if ( match == null ) {
				// redirect to "foreign" host as given by remote
				return backendUrl;
			}


			// replace absolute URL with local one addressing matching proxy
			return Path.join( reverseMap[match], href.substr( match.length ) );
		}

		const base = "/" + ( current || [] ).slice( 0, -1 ).join( "/" );

		if ( backendUrl[0] === "/" ) {
			const myScope = backend.path;
			const myScopeSize = myScope.length;

			if ( backendUrl.indexOf( myScope ) === 0 && backendUrl[myScopeSize].match( /$|[/?#&]/ ) ) {
				return Path.join( proxyPrefix, backendUrl.substr( myScopeSize ) );
			}

			return proxyPrefix;
		}

		return Path.join( proxyPrefix, Path.resolve( base, backendUrl ) );
	}
}
