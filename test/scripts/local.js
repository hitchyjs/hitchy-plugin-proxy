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

const { describe, before, after, it } = require( "mocha" );
const HitchyDev = require( "hitchy-server-dev-tools" );

require( "should" );
require( "should-http" );

const { start: StartHTTP, stop: StopHTTP } = require( "../tools/mirror-server" );


const url = ( from, to ) => `${from}?to=${encodeURIComponent( to )}`;
const redirect = ( from, to, method = "get" ) => HitchyDev.query[method]( url( from, to ) );


describe( "Hitchy instance exposing reverse proxy on request mirror as backend", () => {
	let server = null;
	let mirror = null;

	before( "starting hitchy and mirroring backend", () => {
		return Promise.all( [
			HitchyDev.start( {
				extensionFolder: Path.resolve( __dirname, "../.." ),
				testProjectFolder: Path.resolve( __dirname, "../project" ),
			} ),
			StartHTTP( 23456 ),
			StartHTTP( 23457 ),
		] )
			.then( ( [ _hitchy, _mirror1, _mirror2 ] ) => {
				server = _hitchy;
				mirror = [ _mirror1, _mirror2 ];
			} );
	} );

	after( "stopping hitchy and mirroring backend", () => {
		return Promise.all( [
			server && HitchyDev.stop( server ),
			mirror && mirror[0] && StopHTTP( mirror[0] ),
			mirror && mirror[1] && StopHTTP( mirror[1] ),
		] );
	} );

	it( "is fetching description of a sent GET request", () => {
		return HitchyDev.query.get( "/mirror/some/fake/url" )
			.then( res => {
				res.should.have.status( 200 );
				res.should.have.contentType( "application/json" );

				res.data.should.be.Object();
				res.data.method.should.be.String().which.is.equal( "GET" );
				res.data.url.should.be.String().which.is.equal( "/some/fake/url" );
				res.data.headers.should.be.Object();
				res.data.body.should.be.String().which.is.empty();
			} );
	} );

	it( "is fetching description of a sent POST request", () => {
		return HitchyDev.query.post( "/mirror/some/fake/url?arg=1", {
			name: "John Doe",
		}, {
			"Content-Type": "application/json",
			"X-Special": "provided",
		} )
			.then( res => {
				res.should.have.status( 200 );
				res.should.have.contentType( "application/json" );

				res.data.should.be.Object();
				res.data.method.should.be.String().which.is.equal( "POST" );
				res.data.url.should.be.String().which.is.equal( "/some/fake/url?arg=1" );
				res.data.headers.should.be.Object();
				res.data.headers["x-special"].should.be.String().which.is.equal( "provided" );
				res.data.body.should.be.String().which.is.equal( `{"name":"John Doe"}` );
			} );
	} );

	it( "is fetching description of a sent PUT request", () => {
		return HitchyDev.query.put( "/mirror", {
			name: "Jane Doe",
		}, {
			"Content-Type": "application/json",
			"X-Special": "provided",
		} )
			.then( res => {
				res.should.have.status( 200 );
				res.should.have.contentType( "application/json" );

				res.data.should.be.Object();
				res.data.method.should.be.String().which.is.equal( "PUT" );
				res.data.url.should.be.String().which.is.equal( "/" );
				res.data.headers.should.be.Object();
				res.data.headers["x-special"].should.be.String().which.is.equal( "provided" );
				res.data.body.should.be.String().which.is.equal( `{"name":"Jane Doe"}` );
			} );
	} );

	describe( "is injecting additional proxy-related header", () => {
		it( "X-Forwarded-For", () => {
			return HitchyDev.query.get( "/mirror/some/fake/url" )
				.then( res => {
					res.data.headers.should.have.property( "x-forwarded-for" ).which.is.a.String().and.not.empty();
				} );
		} );

		it( "X-Forwarded-Proto", () => {
			return HitchyDev.query.get( "/mirror/some/fake/url" )
				.then( res => {
					res.data.headers.should.have.property( "x-forwarded-proto" ).which.is.a.String().and.equal( "http" );
				} );
		} );

		it( "Forwarded", () => {
			return HitchyDev.query.get( "/mirror/some/fake/url" )
				.then( res => {
					res.data.headers.should.have.property( "forwarded" ).which.is.a.String().and.not.empty();
				} );
		} );
	} );

	describe( "is extending proxy-related header", () => {
		it( "X-Forwarded-For", () => {
			return HitchyDev.query.get( "/mirror/some/fake/url", null, {
				"x-forwarded-for": "some-client",
			} )
				.then( res => {
					res.data.headers.should.have.property( "x-forwarded-for" ).which.is.a.String().and.startWith( "some-client" );
					res.data.headers["x-forwarded-for"].length.should.be.above( "some-client".length );
				} );
		} );

		it( "Forwarded", () => {
			return HitchyDev.query.get( "/mirror/some/fake/url", null, {
				forwarded: "for=some-client;proto=https",
			} )
				.then( res => {
					res.data.headers.should.have.property( "forwarded" ).which.is.a.String().and.startWith( "for=some-client;proto=https" );
					res.data.headers.forwarded.length.should.be.above( "for=some-client;proto=https".length );
				} );
		} );
	} );

	describe( "is redirected by backend w/o prefix to address which", () => {
		it( "is absolute path name -> translated back to local path name", () => {
			return redirect( "/mirror/redirect/me/301", "/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( url( "/redirect/me/301", "/some/redirected/url" ) );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/mirror/some/redirected/url" );
				} );
		} );

		it( "is relative path name -> translated back to local path name", () => {
			return redirect( "/mirror/redirect/me/301", "some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/redirect/me/301", "some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is relative path name with initial ./ -> translated back to local path name", () => {
			return redirect( "/mirror/redirect/me/301", "./some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/redirect/me/301", "./some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is relative path name with initial ../ -> translated back to local path name", () => {
			return redirect( "/mirror/redirect/me/301", "../some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/redirect/me/301", "../some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/redirect/some/redirected/url" );
				} );
		} );

		it( "is relative path name with too many leading ../ -> translated back to local path name ignoring additional ../", () => {
			return redirect( "/mirror/redirect/me/301", "../../../some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/redirect/me/301", "../../../some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/some/redirected/url" ); // and not "/some/redirected/url"
				} )
				.then( () => redirect( "/mirror/redirect/me/301", "../../../../some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/redirect/me/301", "../../../../some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/some/redirected/url" ); // and not "/some/redirected/url"
				} );
		} );

		it( "is absolute URL of same backend -> translated back to local path name", () => {
			return redirect( "/mirror/redirect/me/301", "http://127.0.0.1:23456/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/redirect/me/301", "http://127.0.0.1:23456/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/some/redirected/url" );
				} );
		} );

		it( "is absolute URL with different port number -> external, not translated", () => {
			return redirect( "/mirror/redirect/me/301", "http://127.0.0.1:2345/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/redirect/me/301", "http://127.0.0.1:2345/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:2345/some/redirected/url" );
				} );
		} );

		it( "is absolute URL with different host name -> external, not translated", () => {
			return redirect( "/mirror/redirect/me/301", "http://127.0.0.2:23456/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/redirect/me/301", "http://127.0.0.2:23456/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.2:23456/some/redirected/url" );
				} );
		} );
	} );

	describe( "is redirected by backend w/ prefix to address which", () => {
		it( "is absolute path name matching same proxy -> translated back to local path name", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "/backend/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "/backend/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/prefixed/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "/backend/some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "/backend/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/prefixed/some/redirected/url" );
				} );
		} );

		it( "is absolute path name matching different proxy -> translated back to local path name addressing related proxy", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "/separate/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "/separate/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sibling/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "/separate/some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "/separate/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sibling/some/redirected/url" );
				} );
		} );

		it( "is absolute path name not matching any proxy -> translated back to absolute URL", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "/foreign/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "/foreign/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/foreign/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "/foreign/some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "/foreign/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/foreign/some/redirected/url" );
				} );
		} );

		it( "is relative path name -> translated back to local path name", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/prefixed/redirect/me/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/prefixed/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is relative path name with initial ./ -> translated back to local absolute path name", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "./some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "./some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/prefixed/redirect/me/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "./some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "./some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/prefixed/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is relative path name with initial ../ -> translated back to local absolute path name", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "../some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "../some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/prefixed/redirect/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "../some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "../some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/prefixed/redirect/some/redirected/url" );
				} );
		} );

		it( "is relative path name with too many leading ../ -> translated back to absolute URL addressing resource not covered by any proxy configuration", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "../../../some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "../../../some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/some/redirected/url" );
				} )
				.then( () => redirect( "/mirror/prefixed/redirect/me/301", "../../../../some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "../../../../some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "../../../some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "../../../some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/some/redirected/url" );
				} )
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "../../../../some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "../../../../some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/some/redirected/url" );
				} );
		} );

		it( "is absolute URL of same backend -> translated back to local absolute path name", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "http://127.0.0.1:23457/backend/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.1:23457/backend/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/prefixed/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "http://127.0.0.1:23457/backend/some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.1:23457/backend/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/prefixed/some/redirected/url" );
				} );
		} );

		it( "is absolute URL of different backend -> translated back to local absolute path name referring to different backend", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "http://127.0.0.1:23457/separate/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.1:23457/separate/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sibling/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "http://127.0.0.1:23457/separate/some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.1:23457/separate/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sibling/some/redirected/url" );
				} );
		} );

		it( "is absolute URL of unsupported backend -> external, not translated", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "http://127.0.0.1:23457/foreign/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.1:23457/foreign/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/foreign/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "http://127.0.0.1:23457/foreign/some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.1:23457/foreign/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/foreign/some/redirected/url" );
				} );
		} );

		it( "is absolute URL with different port number -> external, not translated", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "http://127.0.0.1:2345/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.1:2345/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:2345/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "http://127.0.0.1:2345/some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.1:2345/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:2345/some/redirected/url" );
				} );
		} );

		it( "is absolute URL with different host name -> external, not translated", () => {
			return redirect( "/mirror/prefixed/redirect/me/301", "http://127.0.0.2:23457/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.2:23457/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.2:23457/some/redirected/url" );
				} )
				// try different proxy forwarding to same backend
				.then( () => redirect( "/alt/mirror/prefixed/redirect/me/301", "http://127.0.0.2:23457/some/redirected/url" ) )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/redirect/me/301", "http://127.0.0.2:23457/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.2:23457/some/redirected/url" );
				} );
		} );
	} );

	describe( "is redirected by backend w/ longer prefix to address which", () => {
		it( "is absolute path name matching same proxy -> translated back to local path name", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "/backend/sub/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "/backend/sub/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sub/some/redirected/url" );
				} );
		} );

		it( "is absolute path name matching containing proxy -> translated back to local path name of containing proxy", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "/backend/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "/backend/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/prefixed/some/redirected/url" );
				} );
		} );

		it( "is absolute path name beyond scope of containing proxy -> translated to absolute URL addressing that _foreign_ resource", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/some/redirected/url" );
				} );
		} );

		it( "is relative path name -> translated back to local absolute path name", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sub/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is relative path name with initial ./ -> translated back to local absolute path name", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "./some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "./some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sub/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is relative path name with initial ../ -> translated back to local absolute path name", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "../some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "../some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sub/redirect/some/redirected/url" );
				} );
		} );

		it( "is relative path name with too many leading ../ -> translated back to absolute path name of different proxy configuration covering resulting resource", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "../../../some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "../../../some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/prefixed/some/redirected/url" );
				} );
		} );

		it( "is relative path name with more than too many leading ../ -> translated back to absolute URL addressing resulting resource which is considered foreign", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "../../../../some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "../../../../some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/some/redirected/url" );
				} );
		} );

		it( "is absolute URL addressing same proxy -> translated back to absolute path name", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "http://127.0.0.1:23457/backend/sub/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "http://127.0.0.1:23457/backend/sub/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sub/some/redirected/url" );
				} );
		} );

		it( "is absolute URL addressing covering proxy -> translated back to absolute path name addressing that covering proxy", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "http://127.0.0.1:23457/backend/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "http://127.0.0.1:23457/backend/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/mirror/prefixed/some/redirected/url" );
				} );
		} );

		it( "is absolute URL addressing different proxy -> translated back to absolute path name addressing that different proxy", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "http://127.0.0.1:23457/separate/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "http://127.0.0.1:23457/separate/some/redirected/url" ) );
					res.headers.location.should.be.equal( "/alt/mirror/sibling/some/redirected/url" );
				} );
		} );

		it( "is absolute URL not addressing any proxy on any supported hosts -> external, not translated", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "http://127.0.0.1:23457/foreign/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "http://127.0.0.1:23457/foreign/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:23457/foreign/some/redirected/url" );
				} );
		} );

		it( "is absolute URL using different port number -> external, not translated", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "http://127.0.0.1:2345/backend/sub/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "http://127.0.0.1:2345/backend/sub/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.1:2345/backend/sub/some/redirected/url" );
				} );
		} );

		it( "is absolute URL using different host name -> external, not translated", () => {
			return redirect( "/alt/mirror/sub/redirect/me/301", "http://127.0.0.2:23457/backend/sub/some/redirected/url" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.equal( url( "/backend/sub/redirect/me/301", "http://127.0.0.2:23457/backend/sub/some/redirected/url" ) );
					res.headers.location.should.be.equal( "http://127.0.0.2:23457/backend/sub/some/redirected/url" );
				} );
		} );
	} );
} );
