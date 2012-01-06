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
	var dir = $("#samples_dir").val();
	$.getJSON("samples", {
		samples_dir : dir
	}, function(j) {
		if(j.length == 0) {
			notify("No files found in the specified data directory '" + dir + "'");
			return;
		}
		var options = '';
		for ( var i = 0; i < j.length; i++) {
			options += '<option value="' + j[i].file_name + '">' + j[i].display_string + '</option>';
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
	this.enabled = true;
	this.label = label;
	return true;
}

function References() {
	this.t0 = 0;

	this.sorId="0";
	
	this.minPrice = -1;
	this.maxPrice = -1;

	this.minQuantity = -1;
	this.maxQuantity = -1;
	
	this.orderQuantity = 0;
	this.orderPrice = 0;

	this.t1 = 0;
	
	this.current_smile_time = 0;
	
	this.isFromSor = function(s) {
		return s.sender == this.sorId;
	};
	
	this.isForSor = function(s) {
		return s.target == this.sorId || s.execAuthority == this.sorId;
	};
	
	this.sorY = function(s) {
		if(this.isFromSor(s)) {
			return 1;
		};
		return -1;
	};
	
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
		return this.minPrice; // - this.percent((this.maxPrice - this.minPrice), 2);
	};

	this.priceMaxAxis = function() {
		return this.maxPrice; // + this.percent((this.maxPrice - this.minPrice), 2);
	};
	
	this.quantityMinAxis = function() {
		return this.minQuantity; // - this.percent((this.maxQuantity - this.minQuantity), 2);
	};
	this.quantityMaxAxis = function() {
		return this.maxQuantity; // + this.percent((this.maxQuantity - this.minQuantity), 2);
	};
	
	this.percent = function(v, pc) {
		return (v * pc) / 100;
	};
	
	return true;
}

function PlotData() {
	this.references = new References();
	
	this.mds_v_mde = new DataHolder("MDS(sel)");
	this.mds_p_mde = new DataHolder("MDS(sel)");
	
	this.mds_v_mds = new DataHolder("MDS");
	this.mds_p_mds = new DataHolder("MDS");
	
	this.mds_sel_v = new DataHolder("MDSs");
	this.mds_sel_p = new DataHolder("MDSs");

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

	this.or_flow = new DataHolder("ORDER");
	this.er_flow = new DataHolder("ER");
	this.nos_flow = new DataHolder("NOS");
	this.ocr_flow = new DataHolder("OCR");
		
	this.smile_mds = {};
	this.smile_mde = {};

	this.mds_venues = [];
	
	return true;
}

function priceFormatter(v, axis) {
	return v.toFixed(5);
}

function flowSourceFormatter(v, axis) {
	if(v==1) {
		return "market";
	}
	if(v==0) {
		return "sor";
	}
	if(v==-1) {
		return "client";
	}
	return "";
}

function quantityFormatter(v, axis) {
	if(v>999999) {
		return "" + (v / 1000000) + "M";
	}
	if(v>999) {
		return "" + (v / 1000) + "K";
	}
	return v;
}

function collectData(series) {
	var plotData = new PlotData();
	plotData.references.t0 = series[0].timestamp == null ? 0 : series[0].timestamp;
	plotData.references.orderQuantity = toMio(series[0].orderQty);
	plotData.references.orderPrice = toMio(series[0].price);
	plotData.references.t1 = series[series.length-1].timestamp;
	var firstMds = true;
	for( var i = 0; i<series.length; i++) {
		var s = series[i];
		var relativeTime = s.timestamp - plotData.references.t0;
		var tooltip, tooltip_bid, tooltip_offer;
		
		if(s.event == "Order") {
			tooltip = "[0]" + s.sender + " " + s.side + " " + s.orderQty + " @ " + s.price + " (" + s.rule + ")";
			plotData.or_v.points.push([0, toMio(s.orderQty)]);
			plotData.or_v.points.venues.push(tooltip);
			plotData.or_p.points.push([0, s.price]);
			plotData.or_p.points.venues.push(tooltip);
			plotData.references.updateMinMaxPrice(s.price);
			plotData.or_flow.points.push([0, -1]);
			plotData.or_flow.points.venues.push(tooltip);
		} else if(s.event == "NewOrderSingle") {
			tooltip = "[" + relativeTime + "]" + s.sender + "->" + s.execAuthority + " [" + s.orderQty + " @ " + s.price + "]";
			plotData.nos_v.points.push([relativeTime, toMio(s.orderQty)]);
			plotData.nos_v.points.venues.push(tooltip);
			plotData.nos_p.points.push([relativeTime, s.price]);
			plotData.nos_p.points.venues.push(tooltip);
			plotData.references.updateMinMaxPrice(s.price);
			plotData.nos_flow.points.push([relativeTime, plotData.references.sorY(s)]);
			plotData.nos_flow.points.venues.push(tooltip);
		} else if(s.event == "ExecutionReport") {
			plotData.er_flow.points.push([relativeTime, plotData.references.sorY(s)]);
			var source = s.sender == null ? (s.venue == null ? "unknown" : s.venue) : s.sender;
			var dest = s.target == null ? (s.execAuthority == null ? "unknown" : s.execAuthority) : s.target;
			var p = s.lastShares == null ? "" : "[" + s.lastShares + " @ " + s.price + "]";
			tooltip = "[" + relativeTime + "]" + source + "->" + dest + "[" + s.execType + "/" + s.ordStatus + "] " + p;
			plotData.er_flow.points.venues.push(tooltip);
			if(plotData.references.isForSor(s)) {
				if(s.execType=="REJECT") {
					plotData.er_v_rej.points.push([relativeTime, toMio(s.lastShares)]);
					plotData.er_v_rej.points.venues.push(tooltip);
					
					plotData.er_p_rej.points.push([relativeTime, s.price]);
					plotData.er_p_rej.points.venues.push(tooltip);
				
				} else if(s.execType=="CANCEL") {
					plotData.er_p_canc.points.push([relativeTime, s.price]);
					plotData.er_p_canc.points.venues.push(tooltip);

					plotData.er_v_canc.points.push([relativeTime, toMio(s.lastShares)]);
					plotData.er_v_canc.points.venues.push(tooltip);
				
				} else if(s.execType=="FILL" || s.execType=="PARTIAL_FILL") {
					plotData.er_v_ls.points.push([relativeTime, toMio(s.lastShares)]);
					plotData.er_v_ls.points.venues.push(tooltip);
	
					plotData.er_v_oq.points.push([relativeTime, toMio(s.cumQty)]);
					plotData.er_v_oq.points.venues.push(tooltip);
					
					plotData.er_p.points.push([relativeTime, s.price]);
					plotData.er_p.points.venues.push(tooltip);
				} 
				plotData.references.updateMinMaxPrice(s.price);
			}
		} else if(s.event == "List<MarketDataEntry>") {
			for(var e in s.entries) {
				var entry = s.entries[e];
				if(plotData.smile_mde[relativeTime] == null) {
					plotData.smile_mde[relativeTime] = {};
				}
				if(plotData.smile_mde[relativeTime][entry.venue] == null) {
					plotData.smile_mde[relativeTime][entry.venue] = new DataHolder(entry.venue);
				}
				var type = "";
				if(entry.type != null) {
					type = entry.type + " : ";
				}
				tooltip = type + entry.venue + "[" + entry.quantity + "@" + entry.price + "]";
				plotData.smile_mde[relativeTime][entry.venue].points.push([entry.quantity, entry.price]);
				plotData.smile_mde[relativeTime][entry.venue].points.venues.push(tooltip);
				plotData.references.updateMinMaxQuantity(entry.quantity);
				plotData.references.updateMinMaxPrice(entry.price);
				if(plotData.mds_venues.indexOf(entry.venue)<0) {
					plotData.mds_venues.push(entry.venue);
				}
				plotData.mds_venues.sort();
			}
		} else if(s.event == "MarketDataSnapshot") {
			for(var e in s.entries) {
				var entry = s.entries[e];
				if(plotData.smile_mds[relativeTime] == null) {
					plotData.smile_mds[relativeTime] = {};
				}
				if(plotData.smile_mds[relativeTime][entry.venue] == null) {
					plotData.smile_mds[relativeTime][entry.venue] = new DataHolder(entry.venue);
				}
				plotData.smile_mds[relativeTime][entry.venue].points.push([entry.quantity, entry.price]);
				var type = "";
				if(entry.type != null) {
					type = entry.type + " : ";
				}
				tooltip = type + entry.venue + "[" + entry.quantity + "@" + entry.price + "]";
				plotData.smile_mds[relativeTime][entry.venue].points.venues.push(tooltip);
				plotData.references.updateMinMaxQuantity(entry.quantity);
				plotData.references.updateMinMaxPrice(entry.price);
				if(plotData.mds_venues.indexOf(entry.venue)<0) {
					plotData.mds_venues.push(entry.venue);
				}
				plotData.mds_venues.sort();
			}
		} 
	}
	for(t in plotData.smile_mds) {
		tooltip = "[" + t + "]<br/>";
		for(v in plotData.smile_mds[t]) {
			var venues = plotData.smile_mds[t][v].points.venues;
			var current_bid = "";
			var current_offer = "";
			for(s in venues) {
				if((""+venues[s]).indexOf("bid :") >= 0) {
					current_bid += venues[s] + "<br/>";
				} else {
					current_offer += venues[s] + "<br/>";
				}
			}
			tooltip += buildMarketDataTooltip(current_bid + "<br />" + current_offer);
		}
		plotData.mds_p_mds.points.push([t, plotData.references.minPrice]);
		plotData.mds_p_mds.points.venues.push(tooltip);

		plotData.mds_v_mds.points.push([t, plotData.references.minQuantity]);
		plotData.mds_v_mds.points.venues.push(tooltip);
	}
	for(t in plotData.smile_mde) {
		tooltip = "*[" + t + "]<br/>";
		for(v in plotData.smile_mde[t]) {
			var venues = plotData.smile_mde[t][v].points.venues;
			var current_bid = "";
			var current_offer = "";
			for(s in venues) {
				if((""+venues[s]).indexOf("bid :") >= 0) {
					current_bid += venues[s] + "<br/>";
				} else {
					current_offer += venues[s] + "<br/>";
				}
			}
			tooltip += buildMarketDataTooltip(current_bid + "<br />" + current_offer);
		}
		plotData.mds_p_mde.points.push([t, plotData.references.minPrice]);
		plotData.mds_p_mde.points.venues.push(tooltip);
		
		plotData.mds_v_mde.points.push([t, plotData.references.minQuantity]);
		plotData.mds_v_mde.points.venues.push(tooltip);
	}
	
	generateVenuesCheckboxes(plotData.mds_venues);
	
	return plotData;
} 

function plotFlow(plotData, fromx, tox, fromy, toy) {
	var data_options_flow = [{ 
		data: plotData.or_flow.points,
		stack: false,
		label: plotData.or_flow.label,
		points: { show: true, lineWidth: 1 },
		bars: { show: true, barWidth: 2 }
   },{ 
		data: plotData.nos_flow.points,
		stack: false,
		label: plotData.nos_flow.label,
		points: { show: true, lineWidth: 1 },
		bars: { show: true, barWidth: 2 }
   },{ 
		data: plotData.er_flow.points,
		stack: true,
		label: plotData.er_flow.label,
		points: { show: true, lineWidth: 1 },
		bars: { show: true, barWidth: 2 }
   }];
	
	var plot_options_flow = {
			legend: { show: true, container: $("#placeholder_flow_legend"), margin: 1, noColumns: 6 },
		     grid: { hoverable: true, clickable: true },
		     xaxis: { min: fromx, max: tox },
		     yaxis: { min: fromy, max: toy, tickFormatter: flowSourceFormatter },
		     selection: { mode: "x" }
	};	
	doPlot("flow", data_options_flow, plot_options_flow);
   
}

function plotQuantity(plotData, fromx, tox, fromy, toy) {
	var data_options_quantity = [
	 { 
		data: plotData.mds_v_mds.enabled ? plotData.mds_v_mds.points : [],
		color:"000", 
		label: plotData.mds_v_mds.label,
		points: { show: true, symbol: "diamond", lineWidth: 1 }
   },{ 
		data: plotData.mds_v_mde.enabled ? plotData.mds_v_mde.points : [],
        color:"0F0", 
		label: plotData.mds_v_mde.label,
		points: { show: true, symbol: "diamond", lineWidth: 1 }
   },{ 
		data: plotData.or_v.enabled ? plotData.or_v.points : [],
		label: plotData.or_v.label,
		bars: { show: true, barWidth: 1 },
		points: { show: true, symbol: "triangle", lineWidth: 1 }
   },{ 
		data: plotData.er_v_ls.enabled ? plotData.er_v_ls.points : [],
		label: plotData.er_v_ls.label,
		bars: { show: true, barWidth: 1 },
		points: { show: true, symbol: "triangle", lineWidth: 1 }
   },{ 
		data: plotData.er_v_canc.enabled ? plotData.er_v_canc.points : [],
		label: plotData.er_v_canc.label,
		bars: { show: true, barWidth: 1 },
		points: { show: true, symbol: "cross", lineWidth: 1 }
   },{ 
		data: plotData.er_v_rej.enabled ? plotData.er_v_rej.points : [],
		label: plotData.er_v_rej.label,
		bars: { show: true, barWidth: 1 },
		points: { show: true, symbol: "cross", lineWidth: 1 }
   }, { 
		data: plotData.nos_v.enabled ? plotData.nos_v.points : [], 
		label: plotData.nos_v.label,
		bars: { show: true, barWidth: 1 },
		points: { show: true, symbol: "circle", lineWidth: 1 }
	}];
	
	var plot_options_quantity = {
	legend: { show: true, container: $("#placeholder_quantity_legend"), margin: 1, noColumns: 6 },
     grid: { hoverable: true, clickable: true },
     xaxis: { min: fromx, max: tox },
     yaxis: { min: fromy, max: toy, tickFormatter: quantityFormatter },
     selection: { mode: "xy" }
	};	
	doPlot("quantity", data_options_quantity, plot_options_quantity);
}

function generateVenuesCheckboxes(ary) {
	var container = $("#display_mds_choices");
	var content = "";
	
	for(var v in ary) {
		content += "<input type=\"checkbox\" name=\"venue_" + ary[v] + "\" id=\"venue_" + ary[v] + "\" checked=\"checked\"/><label for=\"" + ary[v] + "\">" + ary[v] + "</label> ";
	}
	container.html(content);
	for(var v in ary) {
		$("#venue_" + ary[v]).click(
			function(){
			    var min_x = -plotData.references.quantityMinAxis();
		        var max_x = plotData.references.quantityMaxAxis();
				var min_y = plotData.references.priceMinAxis();
				var max_y = plotData.references.priceMaxAxis();
		        plotSmile(plotData.references.current_smile_time, plotData, min_x, max_x, min_y, max_y);
			}
		);
	}
}

function plotSmile(time, plotData, from_x, to_x, from_y, to_y) {
	var data_options_smile = [];
	var selected;
	
	var smile_data = [];
	
	var doPlotMds = $("#displaychoices > #MDS").attr("checked");
	var doPlotMdsSel = $("#displaychoices > #MDS_sel").attr("checked");
	if(doPlotMds) {
		smile_data = plotData.smile_mds;
	} else if(doPlotMdsSel) {
		smile_data = plotData.smile_mde;
	}

	for(var t in smile_data) {
		if(t <= time) { 
			selected = t;
		} else {
			break;
		}
	}
	if(selected == null) {
		doPlot("smile", [], {});
		return;
	}
	var entry = smile_data[selected];
	var min_px = from_y;
	var max_px = to_y;
	for(var v in entry) {
		var doPlotVenue = $("#venue_" + v).attr("checked");
		if(doPlotVenue) {
			data_options_smile.push({
				data: entry[v].points,
				label: v,
				stack: false,
				lineWidth: 0,
				points: { show: true },
				bars: { show: true }
			});
		}
	}
	var plot_options_smile = {
			legend: { show: true, container: $("#placeholder_smile_legend"), margin: 1, noColumns: 6 },
			grid: { hoverable: true, clickable: true },
		    selection: { mode: "xy" },
		    xaxis: { min: from_x, max: to_x, tickFormatter: quantityFormatter },
		    yaxis: { min: from_y, max: to_y, tickFormatter: priceFormatter }
		};	

	doPlot("smile", data_options_smile, plot_options_smile);
}

function plotPrices(plotData, fromx, tox, fromy, toy) {
	var data_options_prices = [
     { 
		data: plotData.mds_p_mds.enabled ? plotData.mds_p_mds.points : [],
        color:"000", 
		label: plotData.mds_p_mds.label,
		points: { show: true, symbol: "diamond", lineWidth: 1 }
   },{ 
		data: plotData.mds_p_mde.enabled ? plotData.mds_p_mde.points : [],
        color:"0F0", 
		label: plotData.mds_p_mde.label,
		points: { show: true, symbol: "diamond", lineWidth: 1 }
   },{ 
		data: plotData.or_p.enabled ? plotData.or_p.points : [],
		label: plotData.or_p.label,
		bars: { show: true, barWidth: 1 },
		points: { show: true, symbol: "triangle", lineWidth: 1 }
	},{ 
		data: plotData.er_p.enabled? plotData.er_p.points : [],
		label: plotData.er_p.label,	
		lines: { show: true, steps: false },
		points: { show: true, symbol: "triangle", lineWidth: 1 }
    },{ 
		data: plotData.er_p_canc.enabled ? plotData.er_p_canc.points : [],
		label: plotData.er_p_canc.label,
		lines: { show: true, steps: false },
		points: { show: true, symbol: "cross", lineWidth: 1 }
    },{ 
		data: plotData.er_p_rej.enabled ? plotData.er_p_rej.points : [],
		label: plotData.er_p_rej.label,
		lines: { show: true, steps: false },
		points: { show: true, symbol: "cross", lineWidth: 1 }
    },{ 
		data: plotData.nos_p.enabled ? plotData.nos_p.points : [], 
		label: plotData.nos_p.label,
		lines: { show: true, steps: false },
		points: { show: true, symbol: "circle", lineWidth: 1 }
    }];
	
	var plot_options_prices = {
		legend: { show: true, container: $("#placeholder_prices_legend"), margin: 1, noColumns: 6 },
		grid: { hoverable: true, clickable: true },
		xaxis: { min: fromx, max: tox },
		yaxis: { min: fromy, max: toy, tickFormatter: priceFormatter },
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
	updateEnabledPlots(plotData);
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
	plotFlow(plotData, 
			-(plotData.references.t1-plotData.references.t0) * 0.05, 
			(plotData.references.t1-plotData.references.t0) * 1.05,
			-1, 1);
	plotSmile(plotData.references.current_smile_time, plotData, 
			-(plotData.references.t1-plotData.references.t0) * 0.05, 
			(plotData.references.t1-plotData.references.t0) * 1.05,
			-1, 1);
}

function buildMarketDataTooltip(content) {
	return '<div style="position: relative;border-right: 1px solid #000;float: left; padding:5px">' + content + '</div>';
}

function showTooltip(x, y, contents) {
    $('<div id="tooltip">' + contents + '</div>').css( {
        position: 'absolute',
        display: 'none',
        top: y + 5,
        left: x + 5,
        'font-size': '9px',
        'font-family': 'fixed',
        border: '1px solid #fdd',
        padding: '2px',
        'background-color': '#fee',
        opacity: 0.90
    }).appendTo("body").fadeIn(200);
}

function plotClick(event, pos, item) {
    if (item) {
        var venue = item.series.data.venues[item.dataIndex];
        var points = item.series.data[item.dataIndex];
        plotData.references.current_smile_time = parseInt(points[0]);
	    var min_x = -plotData.references.quantityMinAxis();
        var max_x = plotData.references.quantityMaxAxis();
		var min_y = plotData.references.priceMinAxis();
		var max_y = plotData.references.priceMaxAxis();
        
        plotSmile(plotData.references.current_smile_time, plotData, min_x, max_x, min_y, max_y);
    }
}

function plotHover(event, pos, item) {
    if (item) {
        if (previousPoint != item.dataIndex) {
            previousPoint = item.dataIndex;
            $("#tooltip").remove();
            var venue = item.series.data.venues[item.dataIndex];
            var points = item.series.data[item.dataIndex];
            plotData.references.current_smile_time = parseInt(points[0]);
            showTooltip(item.pageX, item.pageY, venue);
            notify(item.series.label +": time=" + t + ", value=" + points[1] + ", venue=" + venue);
    	    var min_x = -plotData.references.quantityMinAxis();
            var max_x = plotData.references.quantityMaxAxis();
    		var min_y = plotData.references.priceMinAxis();
    		var max_y = plotData.references.priceMaxAxis();
            plotSmile(plotData.references.current_smile_time, plotData, min_x, max_x, min_y, max_y);
        }
    }
    else {
        $("#tooltip").remove();
        notify("<br/>");
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
	if(event.currentTarget.id.indexOf("flow") >=0) {
		plotFlow(plotData, from_x, to_x, from_y, to_y);
	}
	if(event.currentTarget.id.indexOf("smile") >=0) {
		plotSmile(plotData.references.current_smile_time, plotData, from_x, to_x, from_y, to_y);
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
	$.getJSON("samples/" + sel, {
		samples_dir : $("#samples_dir").val()
	}, function(series) {
		if(series.error!=null) {
			error(series.error);
		} else {
			notify("Downloaded '" + sel );
			parseAndPlot(series);
		}
	});
}

function initializePlot() {
	doPlot("prices", [], {});
	doPlot("quantity", [], {});
	doPlot("smile", [], {});
	doPlot("flow", [], {});
}

function resetPlot() {
	plotPricesAndQuantity(plotData);	
}

function updateEnabledPlots(plotData) {
	if(plotData == null) {
		return false;
	}
	var choiceContainer = $("#displaychoices");
	choiceContainer.find("input").each(function () {
        var key = $(this).attr("name");
        var checked = $(this).attr("checked");
        if(key=="ER") {
        	plotData.er_v_ls.enabled = checked;
        	plotData.er_v_oq.enabled = checked;
        	plotData.er_v_canc.enabled = checked;
        	plotData.er_v_rej.enabled = checked;
        	plotData.er_p.enabled = checked;
        	plotData.er_p_canc.enabled = checked;
        	plotData.er_p_rej.enabled = checked;
        	plotData.er_flow.enabled = checked;
        }
        if(key=="NOS") {
        	plotData.nos_v.enabled = checked;
        	plotData.nos_p.enabled = checked;
        	plotData.nos_flow.enabled = checked;
        }
        if(key=="MDS") {
        	plotData.mds_v_mds.enabled = checked;
        	plotData.mds_p_mds.enabled = checked;
        }
        if(key=="MDS_sel") {
        	plotData.mds_v_mde.enabled = checked;
        	plotData.mds_p_mde.enabled = checked;
        }
    });
	
}

function initializeDisplaySelections() {
	var choiceContainer = $("#displaychoices");
	choiceContainer.find("input").click(function(){
		updateEnabledPlots(plotData);
		plotPricesAndQuantity(plotData);	
		doPlot("smile", [], {});
	});
}

function initialize() {
	refreshSamplesList();
	initializeDisplaySelections();
	initializePlot();
}

function csvDownload() {
	var sel = $("#samples option:selected").val();
	var samples_dir = $("#samples_dir").val();

	$("#csvdownload").attr("action", "samples/" + sel);
	$("#csvdownload").find("#samples_dir").attr("value", samples_dir);
	$("#csvdownload").submit();
}

function notify(message)  {
	$("#notificationarea").html("<code>[" + new Date() + "] <br/>" + message + "</code>");
}
function error(message)  {
	$("#notificationarea").html("<code>[" + new Date() + "] <br/><font color='red'>" + message + "</font></code>");
}
function notifyAppend(message)  {
	$("#notificationarea").insertHtml("<br/><code>[" + new Date() + "] <br/>" + message + "</code>");
}

/** ************************* */
function go() {
	plotSelectedSample();
}