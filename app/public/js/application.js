var plotData;
function dump(arr,level) {
	var dumped_text = "";
	if(!level) level = 0;
	
	// The padding given at the beginning of the line.
	var level_padding = "";
	for(var j=0;j<level+1;j++) level_padding += "    ";
	
	if(typeof(arr) == 'object') { // Array/Hashes/Objects
		for(var item in arr) {
			var value = arr[item];
			
			if(typeof(value) == 'object') { // If it is an array,
				dumped_text += level_padding + "'" + item + "' ...\n";
				dumped_text += dump(value,level+1);
			} else {
				dumped_text += level_padding + "'" + item + "' => \"" + value + "\"\n";
			}
		}
	} else { // Stings/Chars/Numbers etc.
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

	this.target="0";
	
	this.minPrice = -1;
	this.maxPrice = -1;

	this.minQuantity = -1;
	this.maxQuantity = -1;
	
	this.orderQuantity = 0;
	this.orderPrice = 0;

	this.t1 = 0;
	
	this.updateMinMaxQuantity = function(q) {
		if(q < this.minQuantity || this.minQuantity == -1) {
			this.minQuantity = q;
		}
		if(q > this.maxQuantity || this.maxQuantity == -1) {
			this.maxQuantity = q;
		}		
	};
	
	this.updateMinMaxPrice = function(price) {
		if(price < this.minPrice || this.minPrice == -1) {
			this.minPrice = price;
		}
		if(price > this.maxPrice || this.maxPrice == -1) {
			this.maxPrice = price;
		}		
	};
	
	this.priceMinAxis = function() {
		return this.minPrice;
	};

	this.priceMaxAxis = function() {
		return this.maxPrice;
	};
	
	this.quantityMinAxis = function() {
		return this.minQuantity;
	};
	this.quantityMaxAxis = function() {
		return this.maxQuantity;
	};
	return true;
}

function PlotData() {
	this.references = new References();
	
	this.mds_v = new DataHolder("MDS");
	this.mds_p = new DataHolder("MDS");

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
	plotData.references.orderQuantity = toMio(series[0].orderQty);
	plotData.references.orderPrice = toMio(series[0].price);
	plotData.references.t1 = series[series.length-1].timestamp;
	
	for( var i = 0; i<series.length; i++) {
		var s = series[i];
		var relativeTime = s.timestamp - plotData.references.t0;
		if(s.event == "Order") {
			plotData.or_v.points.push([0, toMio(s.orderQty)]);
			plotData.or_v.points.venues.push(s.rule);
			plotData.or_p.points.push([0, s.price]);
			plotData.or_p.points.venues.push(s.rule);
			plotData.references.updateMinMaxPrice(s.price);
		} else if(s.event == "NewOrderSingle") {
			plotData.nos_v.points.push([relativeTime, toMio(s.orderQty)]);
			plotData.nos_v.points.venues.push(s.execAuthority);
			plotData.nos_p.points.push([relativeTime, s.price]);
			plotData.nos_p.points.venues.push(s.execAuthority);
			plotData.references.updateMinMaxPrice(s.price);
		} else if(series[i].event == "ExecutionReport" && series[i].target == "0") {
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
				plotData.er_v_ls.points.venues.push(s.venue);

				plotData.er_v_oq.points.push([relativeTime, toMio(s.cumQty)]);
				plotData.er_v_oq.points.venues.push(s.venue);
				
				plotData.er_p.points.push([relativeTime, s.price]);
				plotData.er_p.points.venues.push(s.venue);
			}
			plotData.references.updateMinMaxPrice(s.price);
		} else if(s.event == "MarketDataEntry") {
			// "market":"EBS", "price": "1.342189", "quantity" : "10"
			if(plotData.smile[relativeTime] == null) {
				plotData.smile[relativeTime] = {};
			}
			if(plotData.smile[relativeTime][s.venue] == null) {
				plotData.smile[relativeTime][s.venue] = new DataHolder(s.venue);
			}
			plotData.smile[relativeTime][s.venue].points.push([s.quantity, s.price]);
			plotData.smile[relativeTime][s.venue].points.venues.push(s.venue + "[" + s.quantity + "@" + s.price + "]");
			plotData.smile[relativeTime][s.venue].points.sort(function(ara, arb){ 
				return ara[0] == arb[0] ? ara[1] - arb[1] : ara[0] - arb[0];
			});
			plotData.references.updateMinMaxQuantity(s.quantity);
			plotData.references.updateMinMaxPrice(s.price);
		} else if(s.event == "List<MarketDataEntry>" || s.event=="MarketDataSnapshot") {
			for(var e in s.entries) {
				var entry = s.entries[e];
				if(plotData.smile[relativeTime] == null) {
					plotData.smile[relativeTime] = {};
				}
				if(plotData.smile[relativeTime][entry.venue] == null) {
					plotData.smile[relativeTime][entry.venue] = new DataHolder(entry.venue);
				}
				plotData.smile[relativeTime][entry.venue].points.push([entry.quantity, entry.price]);
				plotData.smile[relativeTime][entry.venue].points.venues.push(entry.venue + "[" + entry.quantity + "@" + entry.price + "]");
				plotData.smile[relativeTime][entry.venue].points.sort(function(ara, arb){ 
					return ara[0] == arb[0] ? ara[1] - arb[1] : ara[0] - arb[0];
				});
				plotData.references.updateMinMaxQuantity(entry.quantity);
				plotData.references.updateMinMaxPrice(entry.price);
			}
		}
	}
	for(t in plotData.smile) {
		plotData.mds_p.points.push([t, plotData.references.minPrice]);
		plotData.mds_v.points.push([t, plotData.references.minQuantity]);
		plotData.mds_p.points.venues.push("MDS(" + t + ")");
		plotData.mds_v.points.venues.push("MDS(" + t + ")");
	}
	return plotData;
} 

function plotQuantity(plotData, fromx, tox, fromy, toy) {
	var data_options_quantity = [{ 
		data: plotData.mds_v.points,
		stack: false,
		label: plotData.mds_v.label,
        radius: 1,
		lineWidth: 1,
		bars: { show: true, barWidth: 1 },
		points: { show: true, symbol: "diamond" }
   },{ 
		data: plotData.or_v.points,
		stack: false,
		label: plotData.or_v.label,
		lineWidth: 1,
		bars: { show: true, barWidth: 10 }
   },{ 
		data: plotData.er_v_oq.points,
		stack: true,
		label: plotData.er_v_oq.label,
		lineWidth: 1,
		bars: { show: true, barWidth: 10 }
   },{ 
		data: plotData.er_v_canc.points,
		stack: false,
		label: plotData.er_v_canc.label,
		lineWidth: 1,
        radius: 1,
		points: { show: true, symbol: "cross" }
   },{ 
		data: plotData.er_v_rej.points,
		stack: false,
		label: plotData.er_v_rej.label,
		lineWidth: 1,
        radius: 1,
		points: { show: true, symbol: "cross" }
   }, { 
		data: plotData.nos_v.points, 
		stack: null,
		label: plotData.nos_v.label,
		points: { show: false },
		lineWidth: 1,
		bars: { show: true, barWidth: 10 }
   },{ 
		data: plotData.er_v_ls.points,
		stack: true,
		lineWidth: 1,
		label: plotData.er_v_ls.label,
		bars: { show: true, barWidth: 10 }
   }];
 
	var plot_options_quantity = {
	legend: { show: true, container: $("#placeholder_quantity_legend"), margin: 1, noColumns: 6 },
     grid: { hoverable: true, clickable: true },
     xaxis: { min: fromx, max: tox },
     yaxis: { min: fromy, max: toy },
     selection: { mode: "xy" }
	};	
	doPlot("quantity", data_options_quantity, plot_options_quantity);
}

function plotSmile(time, plotData) {
	var data_options_smile = [];
	// console.log(dump(plotData.smile));
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
			lineWidth: 0,
			bars: { show: true }
		});
	}
	var plot_options_smile = {
			legend: { show: true, container: $("#placeholder_smile_legend"), margin: 1, noColumns: 6 },
			grid: { hoverable: true, clickable: true },
		    xaxis: { min: -plotData.references.quantityMinAxis(), max: plotData.references.quantityMaxAxis() },
		    yaxis: { min: plotData.references.priceMinAxis(), max: plotData.references.priceMaxAxis() }
		};	

	doPlot("smile", data_options_smile, plot_options_smile);
}

function plotPrices(plotData, fromx, tox, fromy, toy) {
	var data_options_prices = [{ 
		data: plotData.mds_p.points,
		stack: false,
        radius: 2,
		lineWidth: 1,
		bars: { show: true, barWidth: 1 },
		label: plotData.mds_p.label,
		points: { show: true, symbol: "diamond" }
   },{ 
		data: plotData.or_p.points,
		label: plotData.or_p.label,
		lines: { show: true, steps: false },
        radius: 2,
		lineWidth: 1,
		points: { show: true, symbol: "triangle" }
	},{ 
		data: plotData.er_p.points,
		label: plotData.er_p.label,	
		lines: { show: true, steps: false },
        radius: 2,
		lineWidth: 1,
		points: { show: true, symbol: "triangle" }
    },{ 
		data: plotData.er_p_canc.points,
		label: plotData.er_p_canc.label,
        radius: 2,
		lineWidth: 1,
		points: { show: true, symbol: "cross" }
    },{ 
		data: plotData.er_p_rej.points,
		label: plotData.er_p_rej.label,
        radius: 2,
		lineWidth: 1,
		points: { show: true, symbol: "cross" }
    },{ 
		data: plotData.nos_p.points, 
        radius: 2,
		label: plotData.nos_p.label,
		lineWidth: 1,
		lines: { show: true, steps: false },
		points: { show: true, symbol: "circle" }
    }];
	
	var plot_options_prices = {
		legend: { show: true, container: $("#placeholder_prices_legend"), margin: 1, noColumns: 6 },
		grid: { hoverable: true, clickable: true },
		xaxis: { min: fromx, max: tox },
		yaxis: { min: fromy, max: toy },
	     selection: { mode: "xy" }
		
	};	
 	doPlot("prices", data_options_prices, plot_options_prices);	
}
 
function parseAndPlot(series) {
	// todo: remove global plotData
	plotData = collectData(series);
	plotPricesAndQuantity(plotData);
}

function plotPricesAndQuantity(plotData) {
	plotQuantity(plotData, 
			-(plotData.references.t1-plotData.references.t0) * 0.05, 
			(plotData.references.t1-plotData.references.t0) * 1.05,
			plotData.references.quantityMinAxis(),
			plotData.references.quantityMaxAxis());
	plotPrices(plotData, 
			-(plotData.references.t1-plotData.references.t0) * 0.05, 
			(plotData.references.t1-plotData.references.t0) * 1.05,
			plotData.references.priceMinAxis(),
			plotData.references.priceMaxAxis());
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
            plotSmile(t, plotData);
        }
    }
    else {
        $("#tooltip").remove();
    	previousPoint = null;            
    }
}

function plotSelected (event, ranges) {
    var from_x = ranges.xaxis.from.toFixed(2);
	var to_x = ranges.xaxis.to.toFixed(2);
    var from_y = ranges.yaxis.from.toFixed(10);
	var to_y = ranges.yaxis.to.toFixed(10);
	if(event.currentTarget.id.indexOf("quantity") >=0) {
		plotQuantity(plotData, from_x, to_x, from_y, to_y);
	}
	if(event.currentTarget.id.indexOf("price") >=0) {
		plotPrices(plotData, from_x, to_x, from_y, to_y);
	}
}

function doPlot(type, data_options, plot_options) {
	$.plot($("#placeholder_" + type), data_options, plot_options);
	$("#placeholder_" + type).bind("plotclick", plotClick);
	$("#placeholder_" + type).bind("plothover", plotHover);
	$("#placeholder_" + type).bind("plotselected", plotSelected);	
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
	doPlot("quantity", [], {});
	doPlot("smile", [], {});
}

function resetPlot() {
	plotPricesAndQuantity(plotData);	
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
