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


describe( "Hitchy instance with reverse proxy on local mirroring service as backend", () => {
	let server = null;
	let mirror = null;

	before( "starting hitchy and mirroring backend", () => {
		return Promise.all( [
			HitchyDev.start( {
				extensionFolder: Path.resolve( __dirname, "../.." ),
				testProjectFolder: Path.resolve( __dirname, "../project" ),
			} ),
			StartHTTP(),
		] )
			.then( ( [ _hitchy, _mirror ] ) => {
				server = _hitchy;
				mirror = _mirror;
			} );
	} );

	after( "stopping hitchy and mirroring backend", () => {
		return Promise.all( [
			server && HitchyDev.stop( server ),
			mirror && StopHTTP( mirror ),
		] );
	} );

	it( "is fetching description of a sent GET request", () => {
		return HitchyDev.query.get( "/local/mirror/some/fake/url" )
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
		return HitchyDev.query.post( "/local/mirror/some/fake/url?arg=1", {
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
		return HitchyDev.query.put( "/local/mirror", {
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

	describe( "gets redirected to backend's address which", () => {
		it( "is forwarding to absolute local URL", () => {
			return HitchyDev.query.get( "/local/mirror/redirect/me/301?to=%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/redirect/me/301?to=%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/mirror/some/redirected/url" );
				} );
		} );

		it( "is forwarding to relative local URL", () => {
			return HitchyDev.query.get( "/local/mirror/redirect/me/301?to=some%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/redirect/me/301?to=some%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/mirror/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is forwarding to relative local URL starting with period", () => {
			return HitchyDev.query.get( "/local/mirror/redirect/me/301?to=.%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/redirect/me/301?to=.%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/mirror/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is forwarding to relative local URL pointing to parent siblings", () => {
			return HitchyDev.query.get( "/local/mirror/redirect/me/301?to=..%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/redirect/me/301?to=..%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/mirror/redirect/some/redirected/url" );
				} );
		} );

		it( "is forwarding to relative local URL pointing beyond document root of backend", () => {
			return HitchyDev.query.get( "/local/mirror/redirect/me/301?to=..%2F..%2F..%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/redirect/me/301?to=..%2F..%2F..%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/mirror/some/redirected/url" );
				} );
		} );

		it( "is forwarding to itself using absolute URL", () => {
			return HitchyDev.query.get( "/local/mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/mirror/some/redirected/url" );
				} );
		} );

		it( "is forwarding to absolute URL with different port number", () => {
			return HitchyDev.query.get( "/local/mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23457%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23457%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "http://127.0.0.1:23457/some/redirected/url" );
				} );
		} );

		it( "is forwarding to absolute URL with different host name", () => {
			return HitchyDev.query.get( "/local/mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.2%3A23456%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/redirect/me/301?to=http%3A%2F%2F127.0.0.2%3A23456%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "http://127.0.0.2:23456/some/redirected/url" );
				} );
		} );
	} );

	describe( "with a sub-scope gets redirected to backend's address which", () => {
		it( "is forwarding to absolute local URL in proxy's sub-scope", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror" );
				} );
		} );

		it( "is forwarding to absolute local URL beyond proxy's sub-scope", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=%2Fsub%2Fmirrored%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=%2Fsub%2Fmirrored%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/some/redirected/url" );
				} );
		} );

		it( "is forwarding to relative local URL", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=some%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=some%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is forwarding to relative local URL starting with period", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=.%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=.%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/redirect/me/some/redirected/url" );
				} );
		} );

		it( "is forwarding to relative local URL pointing to parent siblings", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=..%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=..%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/redirect/some/redirected/url" );
				} );
		} );

		it( "is forwarding to relative local URL pointing beyond scope of proxy on backend", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=..%2F..%2F..%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=..%2F..%2F..%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/some/redirected/url" );
				} );
		} );

		it( "is forwarding to itself using absolute URL", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fsub%2Fmirrored%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fsub%2Fmirrored%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/some/redirected/url" );
				} );
		} );

		it( "is forwarding to itself using absolute URL which is beyond scope of current proxy but in scope of another reverse proxy", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fto%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fto%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/mirror/to/some/redirected/url" );
				} );
		} );

		it( "is forwarding to absolute URL with different port number", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23457%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23457%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "http://127.0.0.1:23457/some/redirected/url" );
				} );
		} );

		it( "is forwarding to absolute URL with different host name", () => {
			return HitchyDev.query.get( "/local/sub-mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.2%3A23456%2Fsome%2Fredirected%2Furl" )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=http%3A%2F%2F127.0.0.2%3A23456%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "http://127.0.0.2:23456/some/redirected/url" );
				} );
		} );
	} );

	describe( "with a sub-scope gets redirected to backend's address which - when POSTing -", () => {
		it( "is forwarding to absolute local URL in proxy's sub-scope", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=%2Fsome%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );

		it( "is forwarding to absolute local URL beyond proxy's sub-scope", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=%2Fsub%2Fmirrored%2Fsome%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=%2Fsub%2Fmirrored%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/some/redirected/url" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );

		it( "is forwarding to relative local URL", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=some%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=some%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/redirect/me/some/redirected/url" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );

		it( "is forwarding to relative local URL starting with period", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=.%2Fsome%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=.%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/redirect/me/some/redirected/url" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );

		it( "is forwarding to relative local URL pointing to parent siblings", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=..%2Fsome%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=..%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/redirect/some/redirected/url" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );

		it( "is forwarding to relative local URL pointing beyond scope of proxy on backend", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=..%2F..%2F..%2Fsome%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=..%2F..%2F..%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/some/redirected/url" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );

		it( "is forwarding to itself using absolute URL", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fsub%2Fmirrored%2Fsome%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fsub%2Fmirrored%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/sub-mirror/some/redirected/url" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );

		it( "is forwarding to itself using absolute URL which is beyond scope of current proxy but in scope of another reverse proxy", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fto%2Fsome%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23456%2Fto%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "/local/mirror/to/some/redirected/url" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );

		it( "is forwarding to absolute URL with different port number", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23457%2Fsome%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=http%3A%2F%2F127.0.0.1%3A23457%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "http://127.0.0.1:23457/some/redirected/url" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );

		it( "is forwarding to absolute URL with different host name", () => {
			return HitchyDev.query.post( "/local/sub-mirror/redirect/me/301?to=http%3A%2F%2F127.0.0.2%3A23456%2Fsome%2Fredirected%2Furl", { prop: true } )
				.then( res => {
					res.should.have.status( 301 );
					res.data.url.should.be.String().which.is.equal( "/sub/mirrored/redirect/me/301?to=http%3A%2F%2F127.0.0.2%3A23456%2Fsome%2Fredirected%2Furl" );
					res.headers.should.have.property( "location" ).which.is.a.String().and.is.equal( "http://127.0.0.2:23456/some/redirected/url" );
					res.data.body.should.be.String().which.is.equal( `{"prop":true}` );
				} );
		} );
	} );
} );
