import time, random
def polite_sleep(min_s=1.0, max_s=3.0):
    time.sleep(random.uniform(min_s, max_s))
