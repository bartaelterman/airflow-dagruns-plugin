// TODO: Scroll horizontally
// TODO: scroll vertically if n dagids is high
// TODO: Add interactions to DAG runs
// TODO: add vertical reference bar at pointer with date + time

var dagChart = (function () {
    var barheight = 20;        // height of a single bar
    var barSpace = 4;          // vertical space between two bars
    var bottomMargin = 80;     // space for the X axis (ticks) at the bottom of the cart
    var crossf;                // contains a crossfilter object containing the data
    var dimensions = {};       // crossfilter dimensions
    var from = moment();       // minimum datetime. Initialize as empty moment object
    var height;                // total height of the chart (and the entire svg element)
    var maxHeight = 600;       // Maximum height of the chart
    var padding = 20;          // left side padding
    var rightMargin = 130;     // space for the DAG ids on the right side of the cart
    var svg;
    var until = moment();      // maximum datetime. Initialize as empty moment object
    var visibleDAGs = [];    // Array containing the currently visible DAG ids
    var width;


    function getCurrentDayStart() {
        var dayStart = moment();
        dayStart.millisecond(0);
        dayStart.second(0);
        dayStart.minute(0);
        dayStart.hour(0);
        return dayStart;
    }


    function setTodayDateRange() {
        $("#from-datetime > input").val(getCurrentDayStart().format("YYYY-MM-DD HH:mm:ss"));
        $("#until-datetime > input").val(moment().format("YYYY-MM-DD HH:mm:ss"));
    }

    function set2DayDateRange() {
        var dayStart = getCurrentDayStart();
        var yesterdayStart = dayStart.subtract(1, 'days');
        $("#from-datetime > input").val(yesterdayStart.format("YYYY-MM-DD HH:mm:ss"));
        $("#until-datetime > input").val(moment().format("YYYY-MM-DD HH:mm:ss"));
    }

    function set7DayDateRange() {
        var dayStart = getCurrentDayStart();
        var prevStart = dayStart.subtract(7, 'days');
        $("#from-datetime > input").val(prevStart.format("YYYY-MM-DD HH:mm:ss"));
        $("#until-datetime > input").val(moment().format("YYYY-MM-DD HH:mm:ss"));
    }


    // Add events to some UI elements
    function addEvents() {
        // form should not actually submit. Catch that behaviour by binding the submit event to the `refresh`
        // function, and make sure that function returns `false`
        $("form").on("submit", refresh);

        // add a datetime picker element to the from and until inputs
        $(function () {
            $('#from-datetime').datetimepicker({format: "YYYY-MM-DD HH:mm:ss"});
        });
        $(function () {
            $('#until-datetime').datetimepicker({format: "YYYY-MM-DD HH:mm:ss"});
        });


        $("#date-range-today").on("click", setTodayDateRange);

        $("#date-range-last-2-days").on("click", set2DayDateRange);

        $("#date-range-last-7-days").on("click", set7DayDateRange);
    }

    function getDummyData() {
        return [
            {dagId: "sale-ranking", startDate: new Date("2017-11-10T09:00:00.000Z"), endDate: new Date("2017-11-10T09:31:00.000Z"), schedule: "hourly", state: "success"},
            {dagId: "sale-ranking", startDate: new Date("2017-11-10T10:00:00.000Z"), endDate: new Date("2017-11-10T10:31:00.000Z"), schedule: "hourly", state: "failed"},
            {dagId: "sale-ranking", startDate: new Date("2017-11-10T11:00:00.000Z"), endDate: new Date("2017-11-10T11:31:00.000Z"), schedule: "hourly", state: "success"},
            {dagId: "sale-ranking", startDate: new Date("2017-11-10T12:00:00.000Z"), endDate: new Date("2017-11-10T12:31:00.000Z"), schedule: "hourly", state: "running"},
            {dagId: "sql-ingress", startDate: new Date("2017-11-09T09:00:00.000Z"), endDate: new Date("2017-11-09T11:15:00.000Z"), schedule: "daily", state: "success"},
            {dagId: "sql-ingress", startDate: new Date("2017-11-10T09:00:00.000Z"), endDate: new Date("2017-11-10T11:17:00.000Z"), schedule: "daily", state: "success"},
            {dagId: "pingdom-checks", startDate: new Date("2017-11-10T10:20:00.000Z"), endDate: new Date("2017-11-10T10:31:00.000Z"), schedule: "hourly", state: "success"},
            {dagId: "pingdom-checks", startDate: new Date("2017-11-10T09:20:00.000Z"), endDate: new Date("2017-11-10T09:31:00.000Z"), schedule: "hourly", state: "success"},
            {dagId: "pingdom-checks", startDate: new Date("2017-11-10T08:20:00.000Z"), endDate: new Date("2017-11-10T08:31:00.000Z"), schedule: "hourly", state: "success"},
            {dagId: "pingdom-checks", startDate: new Date("2017-11-10T07:20:00.000Z"), endDate: new Date("2017-11-10T07:31:00.000Z"), schedule: "hourly", state: "success"}
        ];
    }

    function parseDates() {
        _.each(data, function(x) {
            x.startDate = new Date(x.startDate);
            x.endDate = new Date(x.endDate);
            x.executionDate = new Date(x.executionDate);
        })
    }


    // Create a crossfilter object of the data records
    function toCrossfilter(data) {
        return crossfilter(data);
    }


    // Create crossfilter dimensions. By setting filters on these dimensions, the visible dag runs can be filtered
    function createDimensions(crossf) {
        dimensions["dagids"] = crossf.dimension(function(d) {return d.dagId;});
        dimensions["schedules"] = crossf.dimension(function(d) {return d.schedule;});
        dimensions["states"] = crossf.dimension(function(d) {return d.state;});
        dimensions["startDate"] = crossf.dimension(function(d) {return d.startDate;});
        dimensions["endDate"] = crossf.dimension(function(d) {return d.endDate;});
        return dimensions;
    }

    function initDateRange() {
        setTodayDateRange();
    }


    // Set the size of the SVG element
    // For the width, check the size of the container element (so it takes a descent size on different screens
    // For the height, check the currently visible DAGs. If that number is small, then decrease the height of
    // the svg. If that number is high, set a maximum height.
    function setSVGSize() {
        width = svg.node().getBoundingClientRect().width;
        height = d3.min([maxHeight, visibleDAGs.length * (barheight + barSpace) + padding * 2 + bottomMargin]);
        svg.attr("height",  height);
    }


    // Read all filters from the UI and add filter functions to the crossfilter dimensions
    function readFilters() {
        // filter DAG ids
        var dagidString = d3.select("#dagid-text").node().value;
        if ( !dagidString ) {
            // if the dagid-text box is empty, ignore this filter entirely
            dimensions["dagids"].filterAll();
        } else {
            var includeOrExclude = $("#dagid-check input:radio:checked").val();
            dimensions["dagids"].filter(function (d) {
                return includeOrExclude === "include" ? d.toLowerCase().indexOf(dagidString) > -1 : d.toLowerCase().indexOf(dagidString) < 0;
            });
        }

        // filter on DAG state
        var selectedStates = $("#dagstate-check input:checkbox:checked").map(function () {return this.value;}).get();
        dimensions["states"].filter(function(d) {
            return selectedStates.indexOf(d) > -1;
        });

        // filter on schedule
        var selectedSchedules = $("#dagschedule-check input:checkbox:checked").map(function () {return this.value;}).get();
        dimensions["schedules"].filter(function(d) {
            if ( selectedSchedules.indexOf(d) > -1 ) {
                return true;
            } else if ( d !== "hourly" & d!== "daily" && selectedSchedules.indexOf("other") > -1) {
                return true
            }
            return false;
        });

        // filter startDate
        from = moment($("#from-datetime input").val());
        if (from.valueOf()) {
            dimensions["startDate"].filter(function(d) {
                return d.valueOf() >= from.valueOf();
            });
        } else {
            dimensions["startDate"].filterAll();
        }

        // filter endDate
        until = moment($("#until-datetime input").val());
        if (until.valueOf()) {
            dimensions["endDate"].filter(function (d) {
                return d.valueOf() <= until.valueOf();
            });
        } else {
            dimensions["endDate"].filterAll();
        }
    }


    // Based on the filters set on the dagids dimension, get the visible DAGs and per DAG
    // check the earliest start time and latest end time (of all runs of that DAG)
    function setVisibleDAGs() {
        visibleDAGs = _.map(
            _.groupBy(
                dimensions["dagids"].top(20),
                function (x) {return x.dagId;}
            ),
            function (dagruns, dagId) {
                var dag = _.reduce(dagruns, function (memo, item) {
                    memo.earliestStart = d3.min([item.startDate, memo.earliestStart]);
                    memo.latestEnd = d3.max([item.endDate, memo.latestEnd]);
                    return memo;
                }, {earliestStart: Infinity, latestEnd: -Infinity});
                dag.dagId = dagId;
                return dag;
            }
        );
    }

    function clearSVG() {
        svg.selectAll("*").remove();
    }


    // calculate the y axis scale. This depends on the number of dag ids that
    // are visible with the currently selected filters.
    function calculateYScale() {
        var sortBy = $("#dagsortby input:radio:checked").val();
        var sortOrder = $("#dagsortorder input:radio:checked").val();
        var domain = _.map(
            _.sortBy(visibleDAGs, function (x) {
                return x[sortBy];
            }), function (x) {
                return x.dagId;
            });
        if ( sortOrder === 'desc' ) {
            domain.reverse();
        }

        var range = _.map(domain, function (x, i) {return padding + (i * (barheight + barSpace));});

        return d3.scale.ordinal()
            .domain(domain)
            .range(range);
    }


    // Draw the chart. First clear the svg and add all elements to the svg
    function drawChart() {
        clearSVG();

        var data = dimensions["dagids"].top(crossf.size());
        var uniqueDAGIds = _.map(visibleDAGs, function (x) {return x.dagId;});

        console.log(data);

        var minStart = from.valueOf() ? from.toDate() : d3.min(data, function(d) {return d.startDate});
        var maxEnd = until.valueOf() ? until.toDate() : d3.max(data, function(d) {return d.endDate});


        // Create scales

        var xScale = d3.time.scale.utc()
	        .domain([minStart, maxEnd])
		    .range([0, width - padding*2 - rightMargin]);

        var yScale = calculateYScale();


        // Create axis

        var axis = d3.svg.axis()
            .orient("bottom")
            .tickFormat(d3.time.format('%m-%d %H:%M'))
            .scale(xScale);

        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", "translate(" + padding + "," + (height - bottomMargin - padding) + ")")
            .call(axis);

        svg.selectAll(".x-axis text")  // select all the text elements for the xaxis
          .attr("transform", function(d) {
              return "translate(" + this.getBBox().height*-2 + "," + (this.getBBox().height + 10) + ")rotate(-45)";
        });

        svg.selectAll(".x-axis .tick line")
            .attr("y1", "-" + (height - padding * 2 - bottomMargin))
            .style("stroke-dasharray", "5");


        // Create bars

        var bars = svg.selectAll(".bar")
            .data(data)
            .enter().append("g")
            .attr("class", "bar")
            .attr("transform", function(d, i) {
                var xTranslation = padding + xScale(d.startDate);
                var yTranslation = yScale(d.dagId);
                return "translate(" + xTranslation + "," + yTranslation + ")";
            });


        bars.append("rect")
            .attr("width", function(d) { return xScale(new Date(minStart.valueOf() + d.endDate.valueOf() - d.startDate.valueOf())); })
            .attr("height", 20)
            .attr("class", function (d) {return d.state;})
            .on("mouseover", function () {
                d3.select(this).attr("fill-opacity", 0.4);
            })
            .on("mouseout", function () {
                d3.select(this).attr("fill-opacity", 1);
            })
            .on("click", function (d) {
                var rect = d3.select(this);

                var url = '/admin/airflow/gantt?dag_id=' + d.dagId + '&execution_date=' + d.executionDateStr;
                console.log(url)
                window.location.href = url;
            })
        ;


        // Create DAG id labels

        var labels = svg.selectAll(".dagLabel")
            .data(uniqueDAGIds)
            .enter()
            .append("text")
            .attr("transform", function(d) {return "translate(" + (width - padding - rightMargin + 5) + "," + (barheight/2 + yScale(d)) + ")";} )
            .text(function (d) {return d;})
            .attr("dominant-baseline", "central");


    }


    // refresh the visualization.
    function refresh() {
        readFilters();
        setVisibleDAGs();
        setSVGSize();
        drawChart();
        return false;  // prevents the form from submitting
    }

    function init() {
        console.log(data);  // should be globally defined in the template
        parseDates();
        svg = d3.select("#chart");
        // var data = getDummyData();
        crossf = toCrossfilter(data);
        createDimensions(crossf);
        initDateRange();
        refresh();
        addEvents();
    }

    init();

})();
