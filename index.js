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

					Debug( "- forwarding %s to %s", prefix, href );

					const proxyHandler = createProxy.call( { Debug }, context, url, proxy, reverseMap );

					routes.set( Path.join( prefix, "/:route*" ), proxyHandler );

					if ( reverseMap.hasOwnProperty( href ) ) {
						reverseMap[href].push( prefix );
					} else {
						reverseMap[href] = [prefix];
					}
				}
			}
		}

		for ( let i = 0; i < numProxies; i++ ) {
			const { prefix, alias } = proxies[i] || {};
			if ( prefix && alias ) {
				const aliases = Array.isArray( alias ) ? alias : [alias];
				const numAliases = aliases.length;

				for ( let j = 0; j < numAliases; j++ ) {
					const _alias = aliases[j];

					if ( _alias && typeof _alias === "string" ) {
						const url = URL.parse( _alias );

						if ( url && url.hostname ) {
							const normalized = `${url.protocol}//${url.hostname}:${url.port || ( url.protocol === "https:" ? 443 : 80 )}${url.path}`;

							if ( !reverseMap.hasOwnProperty( normalized ) ) { // eslint-disable-line max-depth
								reverseMap[normalized] = [prefix];
							}
						}
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
		const client = req.socket.remoteAddress;
		const proto = req.socket.encrypted ? "https" : "http";
		const copiedHeaders = {};

		copiedHeaders["x-forwarded-for"] = client;
		copiedHeaders["x-forwarded-host"] = req.headers.host;
		copiedHeaders["x-forwarded-proto"] = proto;
		copiedHeaders["forwarded"] = `for=${client.indexOf( ":" ) < 0 ? client : '"[' + client + ']"'};proto=${proto}`;

		{
			const source = req.headers;
			const keys = Object.keys( source );
			const numKeys = keys.length;

			for ( let i = 0; i < numKeys; i++ ) {
				const key = keys[i];

				switch ( key ) {
					case "host" :
					case "x-real-ip" :
					case "x-forwarded-proto" :
						// never pass these headers
						break;

					case "x-forwarded-for" :
					case "forwarded" :
						copiedHeaders[key] = `${source[key]},${copiedHeaders[key]}`;
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

		copiedHeaders["x-real-ip"] = client;


		// create local client forwarding request to remote target
		const proxyReqOptions = {
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
			proxyReqOptions.method, proxyReqOptions.protocol, proxyReqOptions.host,
			proxyReqOptions.port, proxyReqOptions.path, proxyReqOptions.headers,
			proxyReqOptions.timeout );

		const proxyReq = library.request( proxyReqOptions, proxyRes => {
			Debug( "response is %d %o", proxyRes.statusCode, proxyRes.headers );

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
						const translated = translateUrlBackendToFrontend( prefix, route, value, proxyReqOptions );

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
	 * @param {string} backendUrl URL suitable for backend to be translated into URL suitable for frontend
	 * @return {string} translated URL addressing same resource for use by frontend e.g. proxy's client
	 */
	function translateUrlBackendToFrontend( proxyPrefix, current, backendUrl ) {
		const url = URL.parse( backendUrl );

		if ( !url.host ) {
			// qualify local path name to always handle absolute URLs below

			// temporarily remove optional query from path name
			const querySplit = /^([^?]*)(\?.*)?$/.exec( backendUrl );
			const pathname = querySplit[1];
			const query = querySplit[2];

			// map relative path name onto absolute path name
			const currentPath = ( current || [] ).slice( 0, -1 ).join( "/" );
			const absolutePath = pathname[0] === "/" ? pathname : Path.resolve( backend.path, currentPath, pathname );

			url.protocol = backend.protocol;
			url.hostname = backend.host;
			url.port = backend.port;
			url.path = absolutePath + ( query == null ? "" : query );
		}

		const qualifiedUrl = `${url.protocol}//${url.hostname}:${url.port || defaultPort}${url.path || ""}${url.hash || ""}`;


		// find proxy with longest prefix matching redirection target
		let match = null;
		const sourcesList = Object.keys( reverseMap );
		const numSourcesLists = sourcesList.length;

		for ( let i = 0; i < numSourcesLists; i++ ) {
			const source = sourcesList[i];

			if ( qualifiedUrl.indexOf( source ) === 0 && ( qualifiedUrl.length === source.length || qualifiedUrl[source.length].match( /[/?#&]/ ) || qualifiedUrl[source.length - 1].match( /[/?#&]/ ) ) ) {
				if ( match == null || source.length > match.length ) {
					match = source;
				}
			}
		}

		if ( match == null ) {
			// redirect to "foreign" host as given by remote
			return qualifiedUrl;
		}


		// choose prefix of proxy to be used in translated URL for addressing backend resource
		const sources = reverseMap[match];
		const numSources = sources.length;
		let source = sources[0];

		for ( let i = 1; i < numSources; i++ ) {
			if ( sources[i] === proxyPrefix ) {
				source = proxyPrefix;
				break;
			}
		}


		// replace absolute URL with local one addressing matching proxy
		return Path.join( source, qualifiedUrl.substr( match.length ) );
	}
}
