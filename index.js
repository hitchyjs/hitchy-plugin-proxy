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

const Path = require( "path" );
const HTTP = require( "http" );
const HTTPS = require( "https" );
const { URL, URLSearchParams } = require( "url" );


/**
 * Declares blueprint route for every configuration of a proxy.
 *
 * @param {object} options Hitchy runtime options
 * @returns {Map<string, function>} maps from routes in functions handling requests for either route
 */
exports.blueprints = function( options ) {
	const { runtime: { config: { proxy: proxies } } } = this;

	const routes = new Map();

	if ( Array.isArray( proxies ) ) {
		for ( let i = 0, numProxies = proxies.length; i < numProxies; i++ ) {
			const proxy = proxies[i] || {};
			const { prefix, target } = proxy;

			if ( prefix && target ) {
				const parsedTarget = new URL( target );
				const proxyHandler = createProxy( parsedTarget.protocol === "https:" ? HTTPS : HTTP, parsedTarget, proxy );

				routes.set( Path.posix.join( prefix, "/:route*" ), proxyHandler );
			}
		}
	}

	return routes;
};

/**
 * Generates request handler forwarding requests to some remote target.
 *
 * @param {object} client provides client implementation to use, it's either HTTP or HTTPS library of NodeJs
 * @param {URL} target pre-compiled URL of proxy's remote target
 * @param {object} config configuration of proxy to be created
 * @returns {function(req:IncomingMessage,res:ServerResponse):void} generated request handler
 */
function createProxy( client, target, config ) {
	const { hideHeaders = [], timeout = 5000 } = config;

	return ( req, res ) => {
		const { route } = req.params;

		// compile URL request should be forwarded to
		const query = new URLSearchParams( req.query );
		const proxyUrl = new URL( "/" + route.join( "/" ) + "?" + query.toString(), target );


		// make a (probably reduced) copy of all incoming request headers
		const copiedHeaders = {};
		{
			const source = req.headers;
			const names = Object.keys( source );
			const numNames = names.length;
			for ( let i = 0; i < numNames; i++ ) {
				const name = names[i];

				switch ( name ) {
					case "host" :
						// never pass these headers
						break;

					default :
						if ( hideHeaders.indexOf( name ) > -1 ) {
							// configuration rejects to pass this header
							break;
						}

						copiedHeaders[name] = source[name];
				}
			}
		}


		// create local client forwarding request to remote target
		const proxyOptions = {
			method: req.method,
			host: proxyUrl.host,
			path: proxyUrl.pathname + ( proxyUrl.search ? "?" + proxyUrl.search : "" ),
			headers: copiedHeaders,
			timeout: timeout,
		};

		const proxyReq = client.request( proxyOptions, proxyRes => {
			res.statusCode = proxyRes.statusCode;

			const source = proxyRes.headers;
			const names = Object.keys( source );
			const numNames = names.length;
			for ( let i = 0; i < numNames; i++ ) {
				const name = names[i];

				res.setHeader( name, source[name] );
			}

			proxyRes.pipe( res );
		} );

		proxyReq.on( "error", error => {
			res.status( 502 ).json( {
				error: error.message,
			} );
		} );

		req.pipe( proxyReq );
	};
}
