var http = require('http');
var url = require('url');
var request = require('request');
var async = require('async');

// Attempt to use the Yahoo Finance V7 API first.
var YAHOOV7 = "https://query1.finance.yahoo.com/v7/finance/quote";
// Currently using Alpha Vantage (www.alphavantage.co) for free quotes as a backup if Yahoo is down.
var ALPHA_VANTAGE = "https://www.alphavantage.co/query?apikey=" + process.env.AVAPIKEY;

function getYahooQuotes (symbols, callback) {
  
  var url = YAHOOV7 + "?symbols=" + symbols.replace(/ /g, ',');
  
  console.log("Requesting " + url + "...");
  request({
      url : url,
      json : true
    },
    function onResponse(err, res, body) {
      console.log("Response for " + symbols + ": " + (err || JSON.stringify(body, null, 2).replace(/\\r\\n/g, '\r\n')));

      if (err) { 
        callback(err);
      } else if (body.error) {
        callback(body.error)
      } else {
        var response = body.quoteResponse;
        if (response.error) {
          callback(response.error);
        } else {
          callback(err, response.result.map(function (quote) { 
            return quote.quoteType == "CURRENCY" ?
              '"' + quote.shortName + '",' + quote.regularMarketPrice + ',' + quote.regularMarketPrice + ' ' + new Date(quote.regularMarketTime * 1000).toLocaleString().replace(/,/, ''):
              '"' + quote.symbol + '",' + quote.regularMarketPrice + ',"' + quote.exchange + '","' + (quote.longName || quote.shortName) + '"';
          }));
        }
      }
    }
  );
}

function getAVQuote(symbol, callback) {

  if (symbol.match(/=/)) {
    const currency = ALPHA_VANTAGE + "&function=CURRENCY_EXCHANGE_RATE&from_currency=" + symbol.substr(0, 3) + "&to_currency=" + symbol.substr(3, 3);
    
    var url = currency;
    
    console.log("Requesting " + url + "...");
    request({
        url : url,
        json : true
      },
      function onResponse(err, res, body) {
        console.log("Response for " + symbol + ": " + (err || JSON.stringify(body, null, 2).replace(/\\r\\n/g, '\r\n')));

        if (body["Realtime Currency Exchange Rate"]) {
          // results from Alpha Vantage take the form:
          // {
          //     "Realtime Currency Exchange Rate": {
          //         "1. From_Currency Code": "USD",
          //         "2. From_Currency Name": "United States Dollar",
          //         "3. To_Currency Code": "CNY",
          //         "4. To_Currency Name": "Chinese Yuan",
          //         "5. Exchange Rate": "6.62220000",
          //         "6. Last Refreshed": "2017-11-03 06:03:32",
          //         "7. Time Zone": "UTC"
          //     }
          // }
          // var name1 = body["Realtime Currency Exchange Rate"]["2. From_Currency Name"];
          // var name2 = body["Realtime Currency Exchange Rate"]["4. To_Currency Name"];
          var n = body["Realtime Currency Exchange Rate"]["1. From_Currency Code"] + '/' + body["Realtime Currency Exchange Rate"]["3. To_Currency Code"];
          var l1 = body["Realtime Currency Exchange Rate"]["5. Exchange Rate"];
          var k1 = l1 + ' ' + body["Realtime Currency Exchange Rate"]["6. Last Refreshed"];
          
          // results from Yahoo (according to http://www.financialwisdomforum.org/gummy-stuff/Yahoo-data.htm) with &f=nl1k1 take the form:
          // "Name",Last Trade (Price Only),Last Trade (Real-time) With Time
          callback(err, '"' + n + '",' + l1 + ',' + k1);
        } else if (JSON.stringify(body) == '{}' || body.Information == 'Please consider optimizing your API call frequency.') {
          // Alpha Vantage doesn't provide us a way to request multiple symbols in one call, so we just have to keep retrying. :(
          setTimeout(function () {
            console.log("Requesting " + url + " again...");
            request({
                url : url,
                json : true
              },
              onResponse);
          }, 1000);
        } else if (/<title>/.test(body)) {
          callback(err, '"' + symbol + '",' + 0 + ',"Error","' + body.match(/<title>(.*)<\/title>/)[1] +'"');
        } else {
          callback(err, '"' + symbol + '",' + 0 + ',"Unknown","' + JSON.stringify(body) +'"');
        }
      }
    );
  } else {
    const intraday = ALPHA_VANTAGE + "&datatype=csv&function=TIME_SERIES_INTRADAY&interval=1min&symbol=" + symbol;
    const daily = ALPHA_VANTAGE + "&datatype=csv&function=TIME_SERIES_DAILY&symbol=" + symbol;
    const names = { // We don't get the name from Alpha Vantage so until I find an API to look them up I'll just hardcode the ones I care about. 
      "MSFT": "Microsoft Corporation",
      "FSELX": "Fidelity Select Semiconductors",
      "VTSAX": "Vanguard Total Stock Market",
      "VTIAX": "Vanguard Intl. Stock Market",
      "SCHK": "Schwab 1000 Index",
      "^NYXBT": "NYSE Bitcoin Index",
      "AGG": "iShares Aggregate Bond Fund",
      "TIP": "iShares TIPS Bond Fund"
    };

    var url = intraday;

    console.log("Requesting " + url + "...");
    request({
        url : url,
        json : true
      },
      function onResponse(err, res, body) {
        console.log("Response for " + symbol + ": " + JSON.stringify(body, null , 2).replace(/\\r\\n/g, '\r\n'));
        
        if (typeof body == 'string' && !/</.test(body)) {
          // results from Alpha Vantage take the form:
          // timestamp,open,high,low,close,volume 
          // 2017-11-01 16:00:00,84.1400,84.1400,84.0300,84.0500,2281047 
          // 2017-11-01 15:59:00,84.1700,84.1800,84.1300,84.1400,118709 
          var s = symbol;
          var l1 = body.split('\n')[1].split(',')[4];
          var x = "Unknown"; // We don't get the exchange.
          var n = names[symbol] || symbol; // We don't get the name either :(
          
          // results from Yahoo (according to http://www.financialwisdomforum.org/gummy-stuff/Yahoo-data.htm) with &f=sl1xn take the form:
          // "Symbol",Last Trade (Price Only),"Exchange","Name"
          callback(err, '"' + s + '",' + l1 + ',"' + x + '","' + n +'"');
        } else if (JSON.stringify(body) == '{}' || body.Information == 'Please consider optimizing your API call frequency.') {
          // Alpha Vantage doesn't provide us a way to request multiple symbols at once, so we'll just keep hammering them.
          setTimeout(function () {
            console.log("Requesting " + url + " again...");
            request({
              url : url,
              json : true
            },
            onResponse);
          }, 1000);
        } else if (body["Error Message"] == "Invalid API call. Please retry or visit the documentation (https://www.alphavantage.co/documentation/) for TIME_SERIES_INTRADAY.") {
          // Alpha Vantage doesn't support intraday prices for all symbols.
          url = daily;
          console.log("Requesting " + url + "...");
          request({
            url : url,
            json : true
          },
          onResponse);
        } else if (/<title>/.test(body)) {
          callback(err, '"' + symbol + '",' + 0 + ',"Error","' + body.match(/<title>(.*)<\/title>/)[1] +'"');
        } else {
          callback(err, '"' + symbol + '",' + 0 + ',"Error","' + JSON.stringify(body) +'"');
        }
      }
    );
  }
}

function onRequest(req, res) {
    var query = url.parse(req.url, true).query;
    if (!query.s) {
      res.end("Missing query parameter: s");
      return;
    }
    if (query.f != 'sl1xn' && query.f != "nl1k1") {
      res.end("We only support query parameter f=sl1xn (f=nl1k1 for currencies) right now.");
    }
    // First attempt to use the Yahoo Finance V7 API.
    getYahooQuotes(query.s, function (err1, quotes) {
      if (quotes) {
        res.end(quotes.join('\n'));
      } else {
        // If that didn't work then use Alpha Vantage (requires each quote separately)
        async.mapLimit(query.s.match(/[^ ]+/g), 1, getAVQuote, function (err2, quotes) {
          if (err2) {
            res.end(err1); // Return the original Yahoo error.
          } else {
            res.end(quotes.join('\n'));
          }
        });
      }
    });
}

http.createServer(onRequest).listen(process.env.PORT, process.env.IP);
