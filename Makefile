# Remember to install the serverless cli first
# example use:
# make python name=new_function_name

python:
ifdef name
	serverless create --template-path templates/python3 --path functions/$(name)
else
	serverless create --template-path templates/python3 --path functions/new_function
endif
