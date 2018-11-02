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

const { describe, before, after, it } = require( "mocha" );

require( "should" );
require( "should-http" );

const { start: StartHTTP, stop: StopHTTP } = require( "../tools/mirror-server" );
const HTTP = require( "http-tag-string" )( "http://localhost:23456" );


describe( "Some special server for help testing proxy functionaly", () => {
	let server = null;

	before( "starting special HTTP server", () => {
		return StartHTTP()
			.then( runningServer => {
				server = runningServer;
			} );
	} );

	after( "stopping special HTTP server", () => {
		return server ? StopHTTP( server ) : null;
	} );

	it( "GETs JSON object", () => {
		return HTTP`GET /some/url`()
			.then( response => {
				response.should.have.status( 200 );

				return response.json()
					.then( json => {
						json.should.be.Object();
						json.method.should.be.String().which.is.equal( "GET" );
						json.url.should.be.String().which.is.equal( "/some/url" );
						json.headers.should.be.Object();
						json.body.should.be.String().which.is.empty();
					} );
			} );
	} );

	it( "POSTs JSON object", () => {
		return HTTP`POST /some/url?arg=1&alt=two
		Content-Type: application/json`( {
			prop: "sent",
		} )
			.then( response => {
				response.should.have.status( 200 );

				return response.json()
					.then( json => {
						json.should.be.Object();
						json.method.should.be.String().which.is.equal( "POST" );
						json.url.should.be.String().which.is.equal( "/some/url?arg=1&alt=two" );
						json.headers.should.be.Object();
						json.headers.should.have.property( "content-type" ).which.is.equal( "application/json" );
						json.body.should.be.String().which.is.equal( `{"prop":"sent"}` );
					} );
			} );
	} );

	it( "PUTs JSON object", () => {
		return HTTP`PUT /some/url?arg=1&alt=two
		Content-Type: application/json
		X-Special-Info: here it comes`( {
			prop: "sent",
		} )
			.then( response => {
				response.should.have.status( 200 );

				return response.json()
					.then( json => {
						json.should.be.Object();
						json.method.should.be.String().which.is.equal( "PUT" );
						json.url.should.be.String().which.is.equal( "/some/url?arg=1&alt=two" );
						json.headers.should.be.Object();
						json.headers.should.have.property( "content-type" ).which.is.equal( "application/json" );
						json.headers.should.have.property( "x-special-info" ).which.is.equal( "here it comes" );
						json.body.should.be.String().which.is.equal( `{"prop":"sent"}` );
					} );
			} );
	} );

	it( "DELETEs JSON object", () => {
		return HTTP`DELETE /some/url?arg=1&alt=two
		Content-Type: application/json
		X-Special-Info: here it comes`()
			.then( response => {
				response.should.have.status( 200 );

				return response.json()
					.then( json => {
						json.should.be.Object();
						json.method.should.be.String().which.is.equal( "DELETE" );
						json.url.should.be.String().which.is.equal( "/some/url?arg=1&alt=two" );
						json.headers.should.be.Object();
						json.headers.should.have.property( "content-type" ).which.is.equal( "application/json" );
						json.headers.should.have.property( "x-special-info" ).which.is.equal( "here it comes" );
						json.body.should.be.String().which.is.empty();
					} );
			} );
	} );

	it( "OPTIONSes JSON object", () => {
		return HTTP`OPTIONS /some/url?arg=1&alt=two
		X-Special-Info: here it comes`()
			.then( response => {
				response.should.have.status( 200 );

				return response.json()
					.then( json => {
						json.should.be.Object();
						json.method.should.be.String().which.is.equal( "OPTIONS" );
						json.url.should.be.String().which.is.equal( "/some/url?arg=1&alt=two" );
						json.headers.should.be.Object();
						json.headers.should.have.property( "x-special-info" ).which.is.equal( "here it comes" );
						json.body.should.be.String().which.is.empty();
					} );
			} );
	} );
} );
