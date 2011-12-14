var plotData;
function dump(arr,level) {
	var dumped_text = "";
	if(!level) level = 0;
	
	//The padding given at the beginning of the line.
	var level_padding = "";
	for(var j=0;j<level+1;j++) level_padding += "    ";
	
	if(typeof(arr) == 'object') { //Array/Hashes/Objects 
		for(var item in arr) {
			var value = arr[item];
			
			if(typeof(value) == 'object') { //If it is an array,
				dumped_text += level_padding + "'" + item + "' ...\n";
				dumped_text += dump(value,level+1);
			} else {
				dumped_text += level_padding + "'" + item + "' => \"" + value + "\"\n";
			}
		}
	} else { //Stings/Chars/Numbers etc.
		dumped_text = "===>"+arr+"<===("+typeof(arr)+")";
	}
	return dumped_text;
}

function refreshSamplesList() {
	$.getJSON("/samples", {
		samples_dir : $("#samples_dir").val()
	}, function(j) {
		var options = '';
		for ( var i = 0; i < j.length; i++) {
			options += '<option value="' + j[i].file_name + '">' + j[i].file_name + '</option>';
		}
		$("#samples").html(options);
	});
}

function toMio(q) {
	if(q!=null) {
		return q.replace("M", "");
	} else {
		return "";
	}
}

function DataHolder(label) {
	this.points = [];
	this.points.venues = [];
	this.venues = [];
	this.label = label;
	return true;
}

function References() {
	this.t0 = 0;
	this.q0 = 0;

	this.minPrice = 0;
	this.maxPrice = 0;

	this.minVolume = 0;
	this.maxVolume = 0;

	this.t1 = 0;
	
	this.updateMinMaxVolume = function(volume) {
		if(volume < this.minVolume) {
			this.minVolume = volume;
		}
		if(volume > this.maxVolume) {
			this.maxVolume = volume;
		}		
	};
	
	this.updateMinMaxPrice = function(price) {
		if(price < this.minPrice) {
			this.minPrice = price;
		}
		if(price > this.maxPrice) {
			this.maxPrice = price;
		}		
	};
	return true;
}

function PlotData() {
	this.references = new References();
	
	this.or_v = new DataHolder("ORDER");
	this.or_p = new DataHolder("ORDER");

	this.er_v_ls = new DataHolder("ER(LS)");
	this.er_v_oq = new DataHolder("ER(Qty)");

	this.er_v_canc = new DataHolder("ER(Canc)");
	this.er_v_rej = new DataHolder("ER(Rej)");

	this.nos_v = new DataHolder("NOS(Qty)");
	this.nos_p = new DataHolder("NOS(px)");
		
	this.er_p = new DataHolder("ER(px)");
	this.er_p_canc = new DataHolder("ER(Canc)");
	this.er_p_rej = new DataHolder("ER(Rej)");

	this.smile = {};
	
	return true;
}

function collectData(series) {
	var plotData = new PlotData();
	plotData.references.t0 = series[0].timestamp == null ? 0 : series[0].timestamp;
	plotData.references.q0 = toMio(series[0].orderQty);

	plotData.references.minPrice = series[0].price;
	plotData.references.maxPrice = series[0].price;

	plotData.references.t1 = series[series.length-1].timestamp;
	
	for( var i = 0; i<series.length; i++) {
		var s = series[i];
		var relativeTime = s.timestamp - plotData.references.t0;
		if(s.event == "Order") {
			plotData.or_v.points.push([0, toMio(s.orderQty)]);
			plotData.or_v.points.venues.push(s.venue);
			plotData.or_p.points.push([0, s.price]);
			plotData.or_p.points.venues.push(s.venue);
		} else if(s.event == "NewOrderSingle") {
			plotData.nos_v.points.push([relativeTime, toMio(s.orderQty)]);
			plotData.nos_v.points.venues.push(s.venue);
			plotData.nos_p.points.push([relativeTime, s.price]);
			plotData.nos_p.points.venues.push(s.venue);
		} else if(series[i].event == "ExecutionReport") {
			if(s.execType=="REJECT") {
				plotData.er_v_rej.points.push([relativeTime, toMio(s.lastShares)]);
				plotData.er_p_rej.points.push([relativeTime, s.price]);
				plotData.er_v_rej.points.venues.push(s.venue);
				plotData.er_p_rej.points.venues.push(s.venue);
			} else if(s.execType=="CANCEL") {
				plotData.er_v_canc.points.push([relativeTime, toMio(s.lastShares)]);
				plotData.er_p_canc.points.push([relativeTime, s.price]);
				plotData.er_v_canc.points.venues.push(s.venue);
				plotData.er_p_canc.points.venues.push(s.venue);
			} else if(s.execType=="FILL" || s.execType=="PARTIAL_FILL") {
				plotData.er_v_ls.points.push([relativeTime, toMio(s.lastShares)]);
				plotData.er_v_oq.points.push([relativeTime, toMio(s.orderQty)]);
				plotData.er_p.points.push([relativeTime, s.price]);
				plotData.er_v_ls.points.venues.push(s.venue);
				plotData.er_v_oq.points.venues.push(s.venue);
				plotData.er_p.points.venues.push(s.venue);
			}
		} else if(series[i].event == "MarketDataEntry") {
			// "market":"EBS", "price": "1.342189", "volume" : "10"
			if(plotData.smile[relativeTime] == null) {
				plotData.smile[relativeTime] = {};
			}
			if(plotData.smile[relativeTime][s.venue] == null) {
				plotData.smile[relativeTime][s.venue] = new DataHolder(s.venue);
			}
			plotData.smile[relativeTime][s.venue].points.push([s.volume, s.price]);
			plotData.smile[relativeTime][s.venue].points.venues.push(s.venue + "[" + s.volume + "@" + s.price + "]");
			plotData.smile[relativeTime][s.venue].points.sort(function(ara, arb){ 
				return ara[0] == arb[0] ? ara[1] - arb[1] : ara[0] - arb[0];
			});
			plotData.references.updateMinMaxVolume(s.volume);
		}
		plotData.references.updateMinMaxPrice(s.price);
	}
	return plotData;
} 

function plotVolume(plotData) {
	var data_options_volume = [{ 
		data: plotData.or_v.points,
		stack: false,
		label: plotData.or_v.label,
		bars: { show: true, barWidth: 10 }
   },{ 
		data: plotData.er_v_oq.points,
		stack: true,
		label: plotData.er_v_oq.label,
		bars: { show: true, barWidth: 10 }
   },{ 
		data: plotData.er_v_canc.points,
		stack: false,
		label: plotData.er_v_canc.label,
		points: { show: true, symbol: "cross" }
   },{ 
		data: plotData.er_v_rej.points,
		stack: false,
		label: plotData.er_v_rej.label,
		points: { show: true, symbol: "cross" }
   }, { 
		data: plotData.nos_v.points, 
		stack: null,
		label: plotData.nos_v.label,
		points: { show: false },
		bars: { show: true, barWidth: 10 }
   },{ 
		data: plotData.er_v_ls.points,
		stack: true,
		label: plotData.er_v_ls.label,
		bars: { show: true, barWidth: 10 }
   }];
 
	var plot_options_volume = {
	legend: { show: true, container: $("#placeholder_volume_legend"), margin: 1, noColumns: 6 },
     grid: { hoverable: true, clickable: true },
     xaxis: { min: -(plotData.references.t1-plotData.references.t0) * 0.05, max: (plotData.references.t1-plotData.references.t0) * 1.05 },
     yaxis: { min: -plotData.references.q0 * 0.05 }
	};	
	doPlot("volume", data_options_volume, plot_options_volume);
}

function plotSmile(time, plotData) {
	var data_options_smile = [];
	//console.log(dump(plotData.smile));
	var selected;
	for(var t in plotData.smile) {
		if(t <= time) { 
			selected = t;
		} else {
			break;
		}
	}
	var entry = plotData.smile[selected];
	for(var v in entry) {
		data_options_smile.push({
			data: entry[v].points,
			label: v,
			stack: false,
			bars: { show: true }
		});
	}
	var plot_options_smile = {
			legend: { show: true, container: $("#placeholder_smile_legend"), margin: 1, noColumns: 6 },
			grid: { hoverable: true, clickable: true },
		    xaxis: { min: plotData.references.minVolume * 0.95, max: plotData.references.maxVolume * 1.05 },
		    yaxis: { min: plotData.references.minPrice * 0.95, max: plotData.references.maxPrice * 1.05 }
		};	

	doPlot("smile", data_options_smile, plot_options_smile);
}

function plotPrices(plotData) {
	var data_options_prices = [{ 
		data: plotData.or_p.points,
		label: plotData.or_p.label,
		lines: { show: true, steps: false },
		points: { show: true, symbol: "triangle" }
	},{ 
		data: plotData.er_p.points,
		label: plotData.er_p.label,	
		lines: { show: true, steps: false },
		points: { show: true, symbol: "triangle" }
    }, { 
		data: plotData.er_p_canc.points,
		label: plotData.er_p_canc.label,
		points: { show: true, symbol: "cross" }
    }, { 
		data: plotData.er_p_rej.points,
		label: plotData.er_p_rej.label,
		points: { show: true, symbol: "cross" }
    }, { 
		data: plotData.nos_p.points, 
		label: plotData.nos_p.label,
		lines: { show: true, steps: false },
		points: { show: true, symbol: "circle" }
    }];
	
	var plot_options_prices = {
		legend: { show: true, container: $("#placeholder_prices_legend"), margin: 1, noColumns: 6 },
		grid: { hoverable: true, clickable: true },
		xaxis: { min: -(plotData.references.t1-plotData.references.t0) * 0.05, max: (plotData.references.t1-plotData.references.t0) * 1.05 },
		yaxis: { min: plotData.references.minPrice * 0.99999 , max: plotData.references.maxPrice * 1.00001 }
	};	
 	doPlot("prices", data_options_prices, plot_options_prices);	
}
 
function parseAndPlot(series) {
	// todo: remove global plotData
	plotData = collectData(series);
	plotVolume(plotData);
	plotPrices(plotData);
}

function showTooltip(x, y, contents) {
    $('<div id="tooltip">' + contents + '</div>').css( {
        position: 'absolute',
        display: 'none',
        top: y + 5,
        left: x + 5,
        border: '1px solid #fdd',
        padding: '2px',
        'background-color': '#fee',
        opacity: 0.80
    }).appendTo("body").fadeIn(200);
}

function plotClick(event, pos, item) {
    if (item) {
        var venue = item.series.data.venues[item.dataIndex];
        var points = item.series.data[item.dataIndex];
        var t = parseInt(points[0]);
//        plot.highlight(item.series, item.datapoint);
//        notify(item.series.label  + ": time=" + t + ", value=" + points[1] + ", venue=" + venue) ;
        plotSmile(t, plotData);
    }
}

function plotHover(event, pos, item) {
    if (item) {
        if (previousPoint != item.dataIndex) {
            previousPoint = item.dataIndex;
            $("#tooltip").remove();
            var venue = item.series.data.venues[item.dataIndex];
            var points = item.series.data[item.dataIndex];
            var t = parseInt(points[0]);
            showTooltip(item.pageX, item.pageY, venue);
            //plotSmile(t, plotData);
        }
    }
    else {
        $("#tooltip").remove();
    	previousPoint = null;            
    }
}

function doPlot(type, data_options, plot_options) {
	$.plot($("#placeholder_" + type), data_options, plot_options);
	$("#placeholder_" + type).bind("plotclick", plotClick);
	$("#placeholder_" + type).bind("plothover", plotHover);
}

function plotSelectedSample() {
	var sel = $("#samples option:selected").val();
	$.getJSON("/samples/" + sel, {
		samples_dir : $("#samples_dir").val()
	}, function(series) {
		notify("Downloaded '" + sel );
		parseAndPlot(series);
	});
}

function initializePlot() {
	doPlot("prices", [], {});
	doPlot("volume", [], {});
	doPlot("smile", [], {});
}

function initialize() {
	refreshSamplesList();
	initializePlot();
}

function notify(message)  {
	$("#notificationarea").html("<code>[" + new Date() + "] <br/>" + message + "</code>");
}
function notifyAppend(message)  {
	$("#notificationarea").insertHtml("<br/><code>[" + new Date() + "] <br/>" + message + "</code>");
}
