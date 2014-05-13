## Pad Web

Modded version of Pad to work on Heroku.

Be sure to pad-master is running as well.

## Using Locally

```bash
# to run locally
foreman start local1,local2
```

Now going to [http://localhost:8080](http://localhost:8080) or [http://lcoalhost:8081](http://lcoalhost:8081) will work.

## Using on Heroku

```bash
# start a single web dyno
heroku scale web=1:1X

# start 3 x16 power web dynos
heroku scale web=3:PX

# shut it down to save money
heroku scale web=0:1X
```
