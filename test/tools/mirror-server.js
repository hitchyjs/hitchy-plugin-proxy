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

const HTTP = require( "http" );

module.exports = {
	start,
	stop,
};

/**
 * Starts HTTP server responding to every incoming request with JSON data set
 * describing properties of either request.
 *
 * @return {Promise<HTTP.Server>} promises HTTP server listening on port 23456
 */
function start() {
	return new Promise( ( resolve, reject ) => {
		const server = HTTP.createServer( ( req, res ) => {
			const chunks = [];

			req.on( "data", chunk => chunks.push( chunk ) );

			req.on( "end", () => {
				const data = {
					method: req.method,
					url: req.url,
					headers: req.headers,
					body: Buffer.concat( chunks ).toString( "utf8" ),
				};

				const match = /^(?:\/sub\/mirrored)?\/redirect\/me\/(30\d)\?to=([^&]+)/.exec( req.url );
				if ( match ) {
					res.statusCode = parseInt( match[1] );
					res.setHeader( "Location", decodeURIComponent( match[2] ) );
				} else {
					res.statusCode = 200;
				}

				res.setHeader( "content-type", "application/json" );
				res.end( Buffer.from( JSON.stringify( data ), "utf8" ) );
			} );
		} );

		server.on( "error", reject );
		server.on( "listening", () => resolve( server ) );

		server.listen( 23456, "127.0.0.1" );
	} );
}

/**
 * Stops server returned from previous call of `start()`.
 *
 * @param {HTTP.Server} server instance of server to be stopped
 * @return {Promise} promises server stopped actually
 */
function stop( server ) {
	return new Promise( resolve => {
		server.close();

		server.on( "close", resolve );
	} );
}
