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



