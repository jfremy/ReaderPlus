/*
    Google Reader Plus groups similar articles together in Google Reader
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
(function() {
    "use strict";
    var entryClassMatch = /entry-[0-9]+/;
    var blacklistTerms = /^(is|are|have|has|do|does|will|should|must|shall|could|what|who|where|which|whose|whom|the|this|that|those|these|a|s|i|you|he|she|it|we|they|his|her|their|our|your|in|or|and|to|but|for|from|of|not|[0-9]+)$/;
    var separatorsLemma = /[\s,;:\.!\?\(\)\[\]"']+/;

    var timerInactivity = 1000; // 1s inactivity timer to detect "end of loading"
    var timerEndLoading = null;
    var manipulatingDom = false;

    var threshold = 0.4;

    var documents = {};
    var idf = {};
    var cosines = {};

    window.chrome.extension.sendRequest("getSensibility", function(response) {
        threshold = response;
    });

    var entries = $("#entries");
    entries.on("DOMNodeInserted", newEntriesEvent );
    entries.on("DOMNodeRemoved", delEntriesEvent);


    // Add button to view details on grouping
    $("<div id='rp-details-button' role='button' class='goog-inline-block jfk-button jfk-button-standard viewer-buttons' tabindex='0' title='ReaderPlus settings'>RP Settings</div>").appendTo("#viewer-top-controls");
    $("#rp-details-button").click(showRPSettings);

    function showRPSettings() {
        $("<div id='rp-overlay' />").appendTo("body");
        $("<div id='rp-details'><div id='rp-title'>Reader Plus Details</div><div id='rp-close'>X</div></div>").appendTo("body");
        $("<div id='rp-slider-caption'><label>Grouping threshold:</label><input type='text' id='rp-threshold' /></div><div id='rp-slider'></div><div id='rp-groups' />").appendTo("#rp-details")
        $("#rp-close").on("click", hideRPSettings);
        $( "#rp-slider" ).slider({
            value: threshold,
            min: 0,
            max: 1,
            step: 0.01,
            slide: function( event, ui ) {
                $( "#rp-threshold" ).val( ui.value );
                displayGroups(ui.value);
            }
        });
        $( "#rp-threshold" ).val( $( "#rp-slider" ).slider( "value" ) );
        displayGroups(threshold);
    }

    function displayGroups(val) {
        var groups = buildGroups(val);
        var numGroups = 0;

        var divGroups = $("#rp-groups");
        var divNumGroups = $("<div class='rp-num-groups'></div>");

        divGroups.empty();
        divNumGroups.appendTo(divGroups);

        $.each(groups, function(i1, e1) {

            var divGroup = $("<div class='rp-group' />").appendTo(divGroups);
            numGroups++;

            $.each(e1, function(i2, e2) {
                $("<div class='rp-entry'>" + documents[e2].doc +"</div>").appendTo(divGroup);
            });
        });
        divNumGroups.html("#groups: " + numGroups);
    }

    function hideRPSettings() {
        $("#rp-overlay").remove();
        $("#rp-details").remove();
    }

    function delEntriesEvent(me) {
        if(manipulatingDom) {
            return;
        }

        var e = $(me.target);
        var numEntry = getEntryNumber(e.prop("class"));
        if(numEntry && documents.hasOwnProperty(numEntry)) {
            delete documents[numEntry];
            delete cosines[numEntry];
        }
    }

    function getEntryNumber(classText) {
        var numEntry = entryClassMatch.exec(classText);
        if(numEntry) {
            return parseInt(numEntry[0].substr(numEntry[0].indexOf("-") + 1));
        }
        return null;
    }

    function newEntriesEvent(me) {
        if(manipulatingDom) {
            return;
        }

        var e = $(me.target);
        var numEntry = getEntryNumber(e.prop("class"));

        // Check if we're expanding a node
        if(e.prop("class").indexOf("entry-actions") != -1) {
            // Take the parent and check if it's an entry
            // Then we'll check if there are associated entries and display the elements needed
            var p = e.parent();
            numEntry = getEntryNumber(p.prop("class"));

            var associatedEntries = p.data("rp_data");
            if(associatedEntries == undefined) {
                return;
            }
            addShowRelatedEntries(e);
            return;
        }
        //Exit if it is not an entry
        if(numEntry == null) {
            return;
        }

        var title = e.find("h2.entry-title");
        documents[numEntry] = termFrequency(title.text());

        // Set timer (will tell us when we can start updating the IDF in TF-IDF since it requires knowing all the documents)
        resetTimer();
    }

    function resetTimer() {
        if(timerEndLoading != null) {
            clearTimeout(timerEndLoading);
        }
        timerEndLoading = setTimeout(triggerTimer, timerInactivity);
    }

    function triggerTimer() {
        var startTime = new Date();
        var endTime, duration;
        clearTimeout(timerEndLoading);

        idf = inverseDocumentFrequency(documents);
        updateCosines(documents, idf);
        var groups = buildGroups(threshold);
        annotateDom(groups);
        endTime = new Date();
        duration = (endTime.getTime() - startTime.getTime()) / 1000;

        console.log("Updated IDF & Cosines in " + duration + "s");
    }

    function termFrequency(doc) {
        // Returns the # occurrences of each term (minus blacklist) inside the document
        // result contains the input, total # of terms and # of occurrences of each terms.
        var result = {
            doc: doc,
            numTerms: 0,
            terms: {},
            getFreq: getFreq
        };

        // Computes frequency for a given term in a document ( freq = |term in doc| / |terms in doc| )
        function getFreq(term) {
            if(result.numTerms == 0) {
                return 0;
            }
            if(!result.terms.hasOwnProperty(term)) {
                return 0;
            }
            return result.terms[term] / result.numTerms;
        }

        var segmentedDoc = segmentDocument(doc);
        $.each(segmentedDoc, function(index, element) {
            //Don't insert terms from the black list
            if(blacklistTerms.exec(element) !=null || element.length == 0) {
               return;
            }
            if(!result.terms.hasOwnProperty(element)) {
                result.terms[element] = 1;
            } else {
                result.terms[element]++;
            }
            result.numTerms++;
        });

        return result;
    }

    function segmentDocument(doc) {
        // Segments a document into individual lemmas
        // Uses the list of separators to determine how to split

        var workDoc = doc.toLowerCase();
        return workDoc.split(separatorsLemma);
    }

    function inverseDocumentFrequency(docs) {
        var result = {
            numDocs: 0,
            terms: {},
            getIDF: getIDF
        };

        // Computes the IDF for a given term ( idf(term) = log( |doc| / |doc containing term|) )
        function getIDF(term) {
            if(result.numDocs == 0) {
                return 0;
            }
            if(!result.terms.hasOwnProperty(term)) {
                return 0;
            }
            return Math.log(result.numDocs / result.terms[term]);
        }

        $.each(docs, function(index, element) {
            // Element contains : doc (string), numTerms (int), terms (object) mapping term -> # occurences
            result.numDocs++;
            $.each(element.terms, function(i) {
                 if(!result.terms.hasOwnProperty(i)) {
                     result.terms[i] = 1;
                 } else {
                     result.terms[i]++;
                 }
            });

        });

        return result;
    }

    function computeCosine(docA, docB, idf) {
        var scalar = 0, normA = 0, normB = 0;
        var coordA, coordB;

        $.each(docA.terms, function(i) {
            coordA = docA.getFreq(i) * idf.getIDF(i);
            normA += coordA * coordA;
            if(docB.terms.hasOwnProperty(i)) {
                coordB = docB.getFreq(i) * idf.getIDF(i);
                scalar += coordA * coordB;
            }
        });

        $.each(docB.terms, function(i2) {
            coordB = docB.getFreq(i2) * idf.getIDF(i2);
            normB += coordB * coordB;
        });

        return scalar / Math.sqrt(normA*normB);
    }

    function updateCosines(docs, idf) {
        $.each(docs, function(i1,e1) {
            var cosDocA;
            if(!cosines.hasOwnProperty(i1)) {
                cosines[i1] = {};
            }
            cosDocA = cosines[i1];

            $.each(docs, function(i2, e2) {
                if(i2 > i1) {
                    return;
                }
                var cosDocB;
                if(!cosines.hasOwnProperty(i2)) {
                    cosines[i2] = {};
                }
                if(!cosDocA.hasOwnProperty(i2)) {
                    cosDocA[i2] = NaN;
                }
                cosDocB = cosDocA[i2];

                // It's useless to recompute the cosine of orthogonal vectors. It will still be 0
                if(cosDocB !== 0) {
                    var cos = computeCosine(e1, e2, idf);
                    cosDocA[i2] = cos;
                    cosines[i2][i1] = cos;
                }
            });
        });
    }

    function buildGroups(threshold) {
        var processed = {};
        var groups = {};

        /*
        go through the graph defined by elements whose cosine is above or equal to threshold
        we use this to creates equivalence classes
         */

        $.each(cosines, function(i) {
            // This element was already processed, so skip it.
            if(processed.hasOwnProperty(i)) {
                return;
            }

            var group = travelCosines(threshold, i);
            if(group.length > 1) {
                groups[i] = group;
            }

            function travelCosines(threshold, key) {
                var classGroups = [];

                if(!cosines.hasOwnProperty(key)) {
                    return classGroups;
                }

                processed[key] = true;
                classGroups.push(key);
                var keyCosines = cosines[key];

                $.each(keyCosines, function(i2, e2) {
                    // We are above the threshold and we have not gone this way before.
                    // recursively add the elements from the equivalence class
                    if(e2 > threshold && !processed.hasOwnProperty(i2)) {
                         classGroups = classGroups.concat(travelCosines(threshold, i2));
                    }

                });
                return classGroups;
            }
        });
        return groups;
    }

    function annotateDom(groups) {
        // TODO: find a better way to distinguish between DOM changes I'm triggering and DOM changes triggered by google
        // reader. Will do for now.
        manipulatingDom = true;
        $.each(groups, function(i,e) {
            var entry = $(".entry-" + i);
            var title = entry.find("h2.entry-title");

            entry.data("rp_data", e);

            // If not already there, add icon next to first article to indicate presence of related articles
            if(!title.prev().hasClass("rp-similar-articles-icon")) {
                title.before($("<div class='rp-similar-articles-icon'></div>"));
            }

            // move related articles together. And hide all but the first
            $.each(e, function(i2, e2) {
                // e is an array so i2 is not interesting
                // don't move the "main" article
                if(e2 == i) {
                    return;
                }
                var similar = $(".entry-" + e2);

                similar.addClass("rp-similar-articles-hide");
                similar.addClass("rp-similar-articles");
                similar.insertAfter(entry);
            });
        });
        manipulatingDom = false;
    }

    function addShowRelatedEntries(elem) {
        var showRelatedEntriesElem = $("<wbr /><span class='read-state link unselectable'>Show related articles</span>");
        var p = elem.parent();

        elem.append(showRelatedEntriesElem);

        if(p.data("rp_state")) {
            showRelatedEntriesElem.addClass("read-state-kept-unread");
        } else {
            showRelatedEntriesElem.addClass("read-state-not-kept-unread");
        }


        showRelatedEntriesElem.on('click',showRelatedEntries);
    }

    function showRelatedEntries(event) {
        var e = $(event.target);
        var state = e.hasClass("read-state-not-kept-unread");

        setStateShowRelatedEntries(e,state);
    }

    function setStateShowRelatedEntries(e, state) {
        var p = e.parent().parent();
        var associatedEntries = p.data("rp_data");
        var numEntry = getEntryNumber(p.prop("class"));

        if(state) {
            e.removeClass("read-state-not-kept-unread");
            e.addClass("read-state-kept-unread");
            $.each(associatedEntries, function(i,e) {
                if(numEntry == e) {
                    return;
                }
                $(".entry-"+ e).removeClass("rp-similar-articles-hide");
            });
        } else {
            e.addClass("read-state-not-kept-unread");
            e.removeClass("read-state-kept-unread");
            $.each(associatedEntries, function(i,e) {
                if(numEntry == e) {
                    return;
                }
                $(".entry-"+ e).addClass("rp-similar-articles-hide");
            });
        }

        p.data("rp_state", state);
    }

})();