require 'cgi'
require 'json'
require 'csv'

get "/samples" do
  samples_dir = params['samples_dir'] || ENV['SAMPLES_DIR']
  ret = []
  unless samples_dir.empty?
    log_files = Dir["#{samples_dir}/*.log"]
    json_files = Dir["#{samples_dir}/*.json"]
    js_files = Dir["#{samples_dir}/*.js"]
    (json_files + js_files + log_files).sort.each do | f |
        display_string = extract_display_string f
        ret << { "file_name" => File.basename(f), "display_string" => display_string } if display_string
    end
  end
  content_type 'application/json', :charset => 'utf-8'
  ret.to_json
end

get "/samples/:name" do
  samples_dir = params['samples_dir'] || ENV['SAMPLES_DIR']
  name = params[:name]
  path = File.join(samples_dir, name)
  found = false
  found = true if File.exist?(path)
  begin
    path = File.join(samples_dir, name)
    path = File.join(samples_dir, CGI.escape(name)) unless File.exist?(path)
    found = true if File.exist?(path)
  end unless(found)
  if(found)
    format = params[:format] || 'json'
    content_type 'application/json', :charset => 'utf-8' if format == 'json'
    begin 
      content_type 'text/csv' 
      attachment "#{File.basename(path, ".json")}.csv"
    end if format == 'csv'
    sample = File.new(path, "r").read
    last_modified = Date.new
    cache_control = :no_cache
    sample = convert(sample, format)
    status 200
    sample
  else
    #status 404
    content_type 'application/json', :charset => 'utf-8'
    status 200
    ret = {"error" => "File selected doent't exist: #{name}" }
  end
end

def to_json(sample)
  ret = sample.strip
  ret.chop! if ret.end_with?(",")
  unless ret.start_with?("[")
    ret = parse_json_string_to_map "[\n#{ret}\n]"
  end
  ret.to_json
end

def to_csv(sample)
  keys = []
  maps = []
  rows = sample.strip.split("\n")
  rows.each do | r |
    map = parse_json_string_to_map r
    maps << map
    keys.concat map.keys
    keys.uniq!
  end
  head = []
  keys.each do | key |
    head << key
  end
  content = ""
  content << head.to_csv 
  maps.each do | map |
    row = []
    keys.each do | key |
        row << (map[key].kind_of?(Array) ? 'array' : map[key] )
    end
    content << row.to_csv
  end
  content
end

def convert(sample, format)
  ret = ""
  if format == 'json'
    ret = to_json(sample)
  end
  if format == 'csv'
    ret = to_csv(sample)
  end
  ret
end

def extract_display_string f
  # f always exist
  res = nil
  File.open(f, "r") do | file |
    puts "Processing '#{file.path}'"
    file.each_line do | line |
      map = parse_json_string_to_map line
      break unless map
      res = []
      res << map["niceTimestamp"] if map["niceTimestamp"]
      res << map["rule"] if map["rule"]
      res << map["side"] if map["side"]
      res << "#{map["orderQty"]}@#{map["price"]}" if map["orderQty"] && map["price"] 
      res << "clOrdId:#{map["clOrderId"]}" if map["clOrderId"]
      res << "size:#{file.stat.size}b"
      break;
    end
  end
  res
end

#def json_string_to_map r
#  pos = r.index("unknown_message")
#  unless pos
#    puts "ignoring unknown line. [pos: #{pos}, line:'#{r}']"
#    return nil;
#  end
#  sanitised = r.strip
#  sanitised.gsub!(/"\s*:\s*"/, '"=>"')
#  sanitised.gsub!(/"\s*:\s*\[/, '"=>[')
#  sanitised.chop! if sanitised.end_with?(",")
#  begin
#    eval(sanitised)
#  rescue Exception => e
#    puts "ignoring invalid map. [error: #{e.message}\nsanitised:'#{sanitised}'\nmap:'#{r}']"
#    nil
#  end
#end

def parse_json_string_to_map string
  sanitised = string
  begin
    sanitised = string.strip
    sanitised.chop! if sanitised.end_with?(",")
    JSON::parse(sanitised)
  rescue => e
    puts "Error parsing json to map: #{sanitised}: #{e}"
    nil
  end
end
