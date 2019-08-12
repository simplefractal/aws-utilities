from s3_utils import do_s3_stuff

def test_do_s3_stuff():
    assert do_s3_stuff() == "did stuff"
