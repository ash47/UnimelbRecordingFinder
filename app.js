// Include dependencies
var fs = require('fs');
var http = require('http');
var parseString = require('xml2js').parseString;

// Jquery stuff
var cheerio = require('cheerio');

// Load any old recordings
var recordings = {};
if(fs.existsSync('./recordings.json')) {
    recordings = require('./recordings.json');
}

// Recording location
var preLink = 'http://download.lecture.unimelb.edu.au/echo360/sections/';
var postLink = '/section.xml';

// Handbook location
var handbookPreLink = 'https://handbook.unimelb.edu.au/view/2014/';

// Function to build recordings.index
function buildRecordings() {
    // Tell the user
    console.log('Updating readable recordings...');

    // Stores IDS
    var ids = {};
    var idList = [];

    // Sort by subject
    for(var key in recordings) {
        // Grab the data for this key
        var data = recordings[key];

        // Ensure this ID exists
        if(!ids[data.id]) {
            // Create entry
            ids[data.id] = {
                name: data.name,
                sems: []
            }

            // Store the key
            idList.push(data.id);
        }

        // Add the semester to this ID
        ids[data.id].sems.push({
            term: data.term,
            url: data.url
        });
    }

    // Sort the key array
    idList.sort();

    // Begin html data
    var recData = '<html><head><style type="text/css">ul{margin-top:0px;margin-bottom:0px;}</style></head><body>\n';

    // Output array
    for(var i=0; i<idList.length; i++) {
        // Grab the data
        var id = idList[i];
        var data = ids[id];

        // Store this subject
        recData += '<a href="'+handbookPreLink+id+'" target="_blank">'+id+' - '+data.name+'</a><br>\n<ul>\n';

        // Sort semesters
        data.sems.sort(function(a, b) {
            if(a.term > b.term) {
                return 1;
            } else if(a.term < b.term) {
                return -1;
            } else {
                return 0;
            }
        });

        // Store each term for this subject
        for(semID in data.sems) {
            var sem = data.sems[semID];
            recData += '<li><a href="'+sem.url+'" target="_blank">'+sem.term+'</a></li>\n';
        }
        recData += '</ul>\n';
    }

    // Close html
    recData += '</body></html>';

    // Store data
    fs.writeFile('./recordings.htm', recData, "utf8", function(err) {
        if (err) throw err;

        // Success!
        console.log('Done updating!');
    });
}

// Tell the user what is going on
console.log('Grabbing lastest links...');

// Request the page containing links
var content = '';
http.get(preLink, function(res) {
    // Grab the data:
    res.on('data', function (chunk) {
        content += chunk;
    }).on('end', function() {
        // Update the user on progress
        console.log('Finished grabbing links, processing...');

        // Prepare cheerio
        $ = cheerio.load(content);

        // Build list of things to process
        var toProcess = [];
        $('table a').each(function() {
            // Grab the link:
            var link = $(this).html();
            link = link.substring(0, link.length-1)

            // Check if it is a valid lecture recording page:
            if(link.length > 30) {
                // Make sure we don't already have this recording
                if(!recordings[link]) {
                    // Store that we need to process this link
                    toProcess.push(link);
                }
            }
        });

        var upto = 0;

        function processLink() {
            // Grab the next link
            var link = toProcess[upto];

            // Update the user's process
            console.log('Processing '+(upto+1)+'/'+toProcess.length+' ('+link+')');

            var xmlContent = '';

            // Request the page:
            http.get(preLink+link+postLink, function(res) {
                // Grab the data:
                res.on('data', function (chunk) {
                    xmlContent += chunk;
                }).on('end', function() {
                    // Pipe into xml parser:
                    parseString(xmlContent, function (err, result) {
                        if(err) {
                            // Failed to parse
                            console.log('Failed to parse XML Link '+link);
                        } else {
                            // Grab data
                            var name = result.section.course[0].name[0];
                            var id = result.section.course[0].identifier[0];
                            var url = result.section.portal[0].url[0];
                            var term = result.section.term[0].name[0];

                            // Tell the user about it
                            console.log('Added '+id+' '+name+'\n');

                            // Store it:
                            recordings[link] = {
                                id: id,
                                name: name,
                                url: url,
                                term: term
                            };

                            // Check if there is anything else to process
                            if(++upto < toProcess.length) {
                                // Process the next link
                                processLink();
                            } else {
                                // All done
                                console.log('Recordings updated, saving...');

                                // Prepare the data
                                var data = JSON.stringify(recordings);

                                // Store file
                                fs.writeFile('./recordings.json', data, "utf8", function(err) {
                                    if (err) {
                                        // Failed to write, lets log the JSON (so they dont lose it)
                                        console.log(data);
                                        throw err;
                                    }

                                    // Success!
                                    console.log('Finished saving recordings!');

                                    // Build the readable recordings now
                                    buildRecordings();
                                });
                            }
                        }
                    })
                });
            }).on('error', function(err) {
                console.log(link+' got error: ' + err.message);
            });
        }

        if(toProcess.length > 0) {
            // Something to process, process it
            processLink();
        } else {
            // Nothing new, just exist
            console.log('Failed to find any new recording links.');
        }
    });
}).on('error', function(err) {
    throw err;
});
