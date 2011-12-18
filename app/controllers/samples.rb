require 'cgi'

get "/samples" do
  samples_dir = params['samples_dir']
  log_files = Dir["#{samples_dir}/*.log"]
  json_files = Dir["#{samples_dir}/*.json"]
  js_files = Dir["#{samples_dir}/*.js"]
  ret = []
  (json_files + js_files + log_files).sort.each do | f |
    ret << { "file_name" => File.basename(f) }
  end

  content_type 'application/json', :charset => 'utf-8'
  my_json = ret.to_s
  ret = my_json.gsub("=>", ":")
  ret
end

get "/samples/:name" do
  samples_dir = params['samples_dir']
  name = params[:name]
  content_type 'application/json', :charset => 'utf-8'
  path = File.join(samples_dir, name)
  found = false
  found = true if File.exist?(path)
  begin
    path = File.join(samples_dir, CGI.escape(name))
    found = true if File.exist?(path)
  end unless(found)
  if(found)
    sample = File.new(path, "r").read
    last_modified = Date.new
    cache_control = :no_cache
    sample.strip!
    sample.chop! if sample.end_with?(",")
    sample = "[\n#{sample}\n]" unless sample.start_with?("[")
    status 200
    sample
  else
    #status 404
    status 200
    ret = <<EOS
      {"error" : "File selected doent't exist: #{name}" }
EOS
  end
end
