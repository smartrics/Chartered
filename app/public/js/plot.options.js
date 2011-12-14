function volumeFormatter(v, axis) {
	return v.toFixed(axis.tickDecimals) + "Mio";
}

var def_volume_options = {
	data : {
		"ExecutionReport" : {
			points : {
				show : true,
				symbol : "cross",
				radius: 3 
			}
		},
		"NewOrderSingle" : {
			points : {
				show : true,
				radius: 3 
			}
		},
		"MarketDataSnapshot" : {
			bars : {
				show : true
			}
		}
	},
	yaxis : {
		alignTicksWithAxis : position == "right" ? 1 : null,
		tickFormatter : volumeFormatter
	}
};

var def_prices_options = {
	data : {
		"ExecutionReport" : {
			points : {
				show : true,
				symbol : "cross",
				radius: 3 
			}
		},
		"NewOrderSingle" : {
			points : {
				show : true,
				symbol : "triangle",
				radius: 3 
			}
		},
		"MarketDataSnapshot" : {
			lines : {
				show : true
			}
		}
	},
	yaxis : {
		alignTicksWithAxis : position == "left" ? 1 : null,
		position : "left"
	}
};

