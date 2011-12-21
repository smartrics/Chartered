require 'cgi'
require 'csv'

get "/samples" do
  samples_dir = params['samples_dir'] || ENV['SAMPLES_DIR']
  log_files = Dir["#{samples_dir}/*.log"]
  json_files = Dir["#{samples_dir}/*.json"]
  js_files = Dir["#{samples_dir}/*.js"]
  ret = []
  (json_files + js_files + log_files).sort.each do | f |
    ret << { "file_name" => File.basename(f), "display_string" => extract_display_string(f) }
  end
  content_type 'application/json', :charset => 'utf-8'
  my_json = ret.to_s
  ret = my_json.gsub("=>", ":")
  ret
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
    puts sample
    last_modified = Date.new
    cache_control = :no_cache
    sample = convert(sample, format)
    status 200
    sample
  else
    #status 404
    content_type 'application/json', :charset => 'utf-8'
    status 200
    ret = <<EOS
      {"error" : "File selected doent't exist: #{name}" }
EOS
  end
end

def to_json(sample)
  ret = sample.strip
  ret = ret.chop if ret.end_with?(",")
  unless ret.start_with?("[")
    ret = "[\n#{ret}\n]"
  end
  ret
end

def to_csv(sample)
  keys = []
  maps = []
  rows = sample.strip.split('\n')
  rows.each do | r |
   sanitised = json_to_map r
   begin
      map = eval(sanitised)
      maps << map
      keys.concat map.keys
      keys.uniq!
    rescue Exception => e
      puts "ignoring invalid map. [error: #{e.message}, map: #{r}]"
    end
  end
  head = []
  keys.each do | key |
    head << key
  end
  
  content = ""
  content << head.to_csv << "\n"
  maps.each do | map |
    row = []
    keys.each do | key |
      row << map[key] if map[key].kind_of?(String)
    end
    content << row.to_csv << "\n"
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
  res = ""
  begin
    File.open(f, "r") do | file |
      file.each_line do | line |
        map = eval(json_to_map(line))
        res << map["niceTimestamp"] << " | " if map["niceTimestamp"]
        res << map["rule"] << " | " if map["rule"]
        res << map["side"] << " | " if map["side"]
        res << map["orderQty"] << "@" << map["price"] << " | " if map["orderQty"] && map["price"] 
        res << "clOrdId:" << map["clOrderId"] if map["clOrderId"]
        break;
      end
    end
  rescue
    res = File.basename(f)
  end
  res
end

def json_to_map r
  sanitised = r.strip
  sanitised = sanitised.chop if sanitised.end_with?(",")
  sanitised = sanitised.gsub(/"\s*:\s*"/, '"=>"')
  sanitised
end
