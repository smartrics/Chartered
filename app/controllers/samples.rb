get "/samples" do
  samples_dir = params['samples_dir']
  log_files = Dir["#{samples_dir}/*.log"]
  json_files = Dir["#{samples_dir}/*.json"]
  ret = []
  (json_files + log_files).sort.each do | f |
    ret << { "file_name" => File.basename(f) }
  end

  content_type 'application/json', :charset => 'utf-8'
  my_json = ret.to_s
  my_json.gsub("=>", ":")
end

get "/samples/:name" do
  samples_dir = params['samples_dir']
  name = params[:name]
  sample = File.new(File.join(samples_dir, name), "r").read
  last_modified = Date.new
  cache_control = :no_cache
  content_type 'application/json', :charset => 'utf-8'
  sample.strip!
  sample.chop! if sample.end_with?(",")
  sample = "[\n#{sample}\n]" unless sample.start_with?("[")
  puts sample
  sample
end
