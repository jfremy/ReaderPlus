/*
 Deduplicator for Google Reader(tm) groups similar articles together in Google Reader(tm)
 Copyright (C) 2012  Jean-François Remy (jeff@melix.org)

 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU Affero General Public License as
 published by the Free Software Foundation, either version 3 of the
 License, or (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Affero General Public License for more details.

 You should have received a copy of the GNU Affero General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// Google Analytics tracking
var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-29307547-1']);

(function() {
    var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
    ga.src = 'https://ssl.google-analytics.com/ga.js';
    var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();

(function() {
    // Default parameters for the sensisibility
    var defaultSettings = {
        'sensibility': 0.3
    };
    var settings = new Store("settings", defaultSettings);

    // Track sensibility
    var sensibility = settings.get("sensibility");
    _gaq.push(['_setCustomVar', 1, 'Sensibility', sensibility.toString() , 2]);
    _gaq.push(['_trackPageview']);

    // Interface with the main page to retrieve / set the sensibility
    window.chrome.extension.onRequest.addListener(
        function(request, sender, sendResponse) {
            if(!request || !request.hasOwnProperty("type")) {
                sendResponse("Invalid query");
            }
            if (request.type == "getSensibility")
                sendResponse(settings.get("sensibility"));
            else if(request.type = "setSensibility" && request.hasOwnProperty("val")) {
                settings.set("sensibility", request.val);
                _gaq.push(['_setCustomVar', 1, 'Sensibility', request.val.toString(), 2]);
                _gaq.push(['_trackEvent', 'Sensibility', 'Change', request.val.toString(), request.val]);
            } else {
                sendResponse("Failed"); // snub them.
            }
        });
})();



