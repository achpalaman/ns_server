%% @author Northscale <info@northscale.com>
%% @copyright 2010 NorthScale, Inc.
%%
%% Licensed under the Apache License, Version 2.0 (the "License");
%% you may not use this file except in compliance with the License.
%% You may obtain a copy of the License at
%%
%%      http://www.apache.org/licenses/LICENSE-2.0
%%
%% Unless required by applicable law or agreed to in writing, software
%% distributed under the License is distributed on an "AS IS" BASIS,
%% WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
%% See the License for the specific language governing permissions and
%% limitations under the License.
%%
%% This module lets you treat a memcached process as a gen_server.
%% Right now we have one of these registered per node, which stays
%% connected to the local memcached server as the admin user. All
%% communication with that memcached server is expected to pass
%% through distributed erlang, not using memcached prototocol over the
%% LAN.
%%
-module(ns_memcached).

-behaviour(gen_server).

-include("ns_common.hrl").

-define(CHECK_INTERVAL, 10000).
-define(VBUCKET_POLL_INTERVAL, 100).
-define(TIMEOUT, 30000).

%% gen_server API
-export([start_link/1]).
-export([init/1, handle_call/3, handle_cast/2,
         handle_info/2, terminate/2, code_change/3]).

-record(state, {bucket::nonempty_string(), sock::port()}).

%% external API
-export([active_buckets/0, connected/2,
         delete_vbucket/2, delete_vbucket/3,
         get_vbucket/3,
         host_port_str/0, host_port_str/1,
         list_vbuckets/1, list_vbuckets/2,
         list_vbuckets_multi/2,
         set_vbucket/3, set_vbucket/4,
         server/1,
         stats/1, stats/2,
         topkeys/1,
         sync_bucket_config/1]).

-include("mc_constants.hrl").
-include("mc_entry.hrl").

%%
%% gen_server API implementation
%%

start_link(Bucket) ->
    %% Use proc_lib so that start_link doesn't fail if we can't
    %% connect.
    proc_lib:start_link(?MODULE, init, [Bucket]).


%%
%% gen_server callback implementation
%%

init(Bucket) ->
    proc_lib:init_ack({ok, self()}),
    Sock = connect(),
    StartTime = now(),
    ensure_bucket(Sock, Bucket),
    wait_for_warmup(Sock),
    ns_log:log(?MODULE, 1, "Bucket ~p loaded on node ~p in ~p seconds.",
               [Bucket, node(), timer:now_diff(now(), StartTime) div 1000000]),
    register(server(Bucket), self()),
    timer:send_interval(?CHECK_INTERVAL, check_config),
    %% this trap_exit is necessary for terminate callback to work
    process_flag(trap_exit, true),
    gen_server:enter_loop(?MODULE, [], #state{sock=Sock, bucket=Bucket}).


handle_call({delete_vbucket, VBucket}, _From, #state{sock=Sock} = State) ->
    case mc_client_binary:delete_vbucket(Sock, VBucket) of
        ok ->
            {reply, ok, State};
        {memcached_error, einval, _} ->
            ok = mc_client_binary:set_vbucket(Sock, VBucket,
                                              dead),
            Reply = mc_client_binary:delete_vbucket(Sock, VBucket),
            {reply, Reply, State}
    end;
handle_call({get_vbucket, VBucket}, _From, State) ->
    Reply = mc_client_binary:get_vbucket(State#state.sock, VBucket),
    {reply, Reply, State};
handle_call(list_buckets, _From, State) ->
    Reply = mc_client_binary:list_buckets(State#state.sock),
    {reply, Reply, State};
handle_call(list_vbuckets, _From, State) ->
    Reply = mc_client_binary:stats(
              State#state.sock, <<"vbucket">>,
              fun (<<"vb_", K/binary>>, V, Acc) ->
                      [{list_to_integer(binary_to_list(K)),
                        binary_to_existing_atom(V, latin1)} | Acc]
              end, []),
    {reply, Reply, State};
handle_call(noop, _From, State) ->
    {reply, ok, State};
handle_call({set_flush_param, Key, Value}, _From, State) ->
    Reply = mc_client_binary:set_flush_param(State#state.sock, Key, Value),
    {reply, Reply, State};
handle_call({set_vbucket, VBucket, VBState}, _From,
            #state{sock=Sock} = State) ->
    %% This happens asynchronously, so there's no guarantee the
    %% vbucket will be in the requested state when it returns.
    Reply = mc_client_binary:set_vbucket(Sock, VBucket, VBState),
    {reply, Reply, State};
handle_call({stats, Key}, _From, State) ->
    Reply = mc_client_binary:stats(
              State#state.sock, Key,
              fun (K, V, Acc) ->
                      [{K, V} | Acc]
              end, []),
    {reply, Reply, State};
handle_call(topkeys, _From, State) ->
    Reply = mc_client_binary:stats(
              State#state.sock, <<"topkeys">>,
              fun (K, V, Acc) ->
                      VString = binary_to_list(V),
                      Tokens = string:tokens(VString, ","),
                      [{binary_to_list(K),
                        lists:map(fun (S) ->
                                          [Key, Value] = string:tokens(S, "="),
                                          {list_to_atom(Key),
                                           list_to_integer(Value)}
                                  end,
                                  Tokens)} | Acc]
              end,
              []),
    {reply, Reply, State};
handle_call(sync_bucket_config, _From, State) ->
    handle_info(check_config, State),
    {reply, ok, State}.


handle_cast(unhandled, unhandled) ->
    unhandled.


handle_info(check_config, State) ->
    misc:flush(check_config),
    ensure_bucket(State#state.sock, State#state.bucket),
    {noreply, State};
handle_info({reap, VBucket, From}, State) ->
    case mc_client_binary:delete_vbucket(State#state.sock, VBucket) of
        ok ->
            gen_server:reply(From, ok);
        {memcached_error, einval, _} ->
            timer:send_after(?VBUCKET_POLL_INTERVAL, {reap, VBucket, From})
    end,
    {noreply, State};
handle_info({wait_for_vbucket, VBucket, VBState, Callback},
            #state{sock=Sock} = State) ->
    wait_for_vbucket(Sock, VBucket, VBState, Callback),
    {noreply, State};
handle_info({'EXIT', _, Reason} = Msg, State) ->
    ?log_info("Got ~p. Exiting.", [Msg]),
    {stop, Reason, State};
handle_info(Msg, State) ->
    ?log_info("handle_info(~p, ~p)", [Msg, State]),
    {noreply, State}.


terminate(Reason, #state{bucket=Bucket, sock=Sock}) ->
    %% Unregister so nothing else tries to talk to us
    unregister(server(Bucket)),
    if
        Reason == normal; Reason == shutdown ->
            case ns_bucket:get_bucket(Bucket) of
                not_present ->
                    ns_log:log(?MODULE, 2,
                               "Deleting data on ~p for deleted bucket ~p",
                               [node(), Bucket]),
                    mc_client_binary:flush(Sock);
                {ok, BucketConfig} ->
                    case lists:member(node(), proplists:get_value(
                                                servers, BucketConfig)) of
                        true ->
                            ok;
                        false ->
                            ns_log:log(
                              ?MODULE, 3,
                              "Deleting data for bucket ~p on ~p since bucket "
                              "is no longer mapped to node.",
                              [Bucket, node()]),
                            mc_client_binary:flush(Sock)
                    end
            end,
            ?log_info("Shutting down bucket ~p", [Bucket]),
            try
                mc_client_binary:delete_bucket(Sock, Bucket)
            catch
                E:R ->
                    ?log_error("Failed to delete bucket ~p: ~p",
                               [Bucket, {E, R}])
            end;
        true ->
            ns_log:log(?MODULE, 4,
                       "Control connection to memcached on ~p disconnected: ~p",
                       [node(), Reason])
    end,
    ok = gen_tcp:close(Sock),
    ok.


code_change(_OldVsn, State, _Extra) ->
    {ok, State}.


%%
%% API
%%

active_buckets() ->
    [Bucket || ?MODULE_STRING "-" ++ Bucket <-
                   [atom_to_list(Name) || Name <- registered()]].

connected(Node, Bucket) ->
    try gen_server:call({server(Bucket), Node}, noop) of
        ok ->
            true
    catch
        _:_ ->
            false
    end.


%% @doc Delete a vbucket. Will set the vbucket to dead state if it
%% isn't already, blocking until it successfully does so.
delete_vbucket(Bucket, VBucket) ->
    gen_server:call(server(Bucket), {delete_vbucket, VBucket}, ?TIMEOUT).


delete_vbucket(Node, Bucket, VBucket) ->
    gen_server:call({server(Bucket), Node}, {delete_vbucket, VBucket},
                    ?TIMEOUT).


get_vbucket(Node, Bucket, VBucket) ->
    gen_server:call({server(Bucket), Node}, {get_vbucket, VBucket}, ?TIMEOUT).


host_port_str() ->
    host_port_str(node()).


host_port_str(Node) ->
    Config = ns_config:get(),
    Port = ns_config:search_node_prop(Node, Config, memcached, port),
    {_Name, Host} = misc:node_name_host(Node),
    Host ++ ":" ++ integer_to_list(Port).


list_vbuckets(Bucket) ->
    list_vbuckets(node(), Bucket).


list_vbuckets(Node, Bucket) ->
    gen_server:call({server(Bucket), Node}, list_vbuckets, ?TIMEOUT).


list_vbuckets_multi(Nodes, Bucket) ->
    UpNodes = [node()|nodes()],
    {LiveNodes, DeadNodes} = lists:partition(
                               fun (Node) ->
                                       lists:member(Node, UpNodes)
                               end, Nodes),
    {Replies, Zombies} =
        gen_server:multi_call(LiveNodes, server(Bucket), list_vbuckets,
                              ?TIMEOUT),
    {Replies, Zombies ++ DeadNodes}.


set_vbucket(Bucket, VBucket, VBState) ->
    gen_server:call(server(Bucket), {set_vbucket, VBucket, VBState}, ?TIMEOUT).


set_vbucket(Node, Bucket, VBucket, VBState) ->
    gen_server:call({server(Bucket), Node}, {set_vbucket, VBucket, VBState},
                    ?TIMEOUT).


stats(Bucket) ->
    stats(Bucket, <<>>).


stats(Bucket, Key) ->
    gen_server:call(server(Bucket), {stats, Key}, ?TIMEOUT).


topkeys(Bucket) ->
    gen_server:call(server(Bucket), topkeys, ?TIMEOUT).

sync_bucket_config(Bucket) ->
    gen_server:call(server(Bucket), sync_bucket_config, ?TIMEOUT).


%%
%% Internal functions
%%

connect() ->
    Config = ns_config:get(),
    Port = ns_config:search_node_prop(Config, memcached, port),
    User = ns_config:search_node_prop(Config, memcached, admin_user),
    Pass = ns_config:search_node_prop(Config, memcached, admin_pass),
    try
        {ok, S} = gen_tcp:connect("127.0.0.1", Port, [binary, {packet, 0},
                                                         {active, false}]),
        ok = mc_client_binary:auth(S, {<<"PLAIN">>,
                                       {list_to_binary(User),
                                        list_to_binary(Pass)}}),
        S of
        Sock -> Sock
    catch
        E:R ->
            ?log_warning("Unable to connect: ~p, retrying.", [{E, R}]),
            timer:sleep(1000), % Avoid reconnecting too fast.
            connect()
    end.


ensure_bucket(Sock, Bucket) ->
    try ns_bucket:config_string(Bucket) of
        {Engine, ConfigString, BucketType, ExtraParams} ->
            case mc_client_binary:select_bucket(Sock, Bucket) of
                ok ->
                    ensure_bucket_config(Sock, Bucket, BucketType, ExtraParams);
                {memcached_error, key_enoent, _} ->
                    case mc_client_binary:create_bucket(Sock, Bucket, Engine,
                                                        ConfigString) of
                        ok ->
                            ?log_info("Created bucket ~p with config string ~p",
                                      [Bucket, ConfigString]),
                            ok = mc_client_binary:select_bucket(Sock, Bucket);
                        {memcached_error, key_eexists, <<"Bucket exists: stopping">>} ->
                            %% Waiting for an old bucket with this name to shut down
                            ?log_info("Waiting for ~p to finish shutting down before we start it.",
                                      [Bucket]),
                            timer:sleep(1000),
                            ensure_bucket(Sock, Bucket);
                        Error ->
                            {error, {bucket_create_error, Error}}
                    end;
                Error ->
                    {error, {bucket_select_error, Error}}
            end
    catch
        E:R ->
            ?log_error("Unable to get config for bucket ~p: ~p",
                       [Bucket, {E, R}]),
            {E, R}
    end.


-spec ensure_bucket_config(port(), bucket_name(), bucket_type(),
                           {pos_integer(), nonempty_string()}) ->
                                  ok | no_return().
ensure_bucket_config(Sock, Bucket, membase, {MaxSize, DBDir}) ->
    MaxSizeBin = list_to_binary(integer_to_list(MaxSize)),
    DBDirBin = list_to_binary(DBDir),
    {ok, {ActualMaxSizeBin,
          ActualDBDirBin}} = mc_client_binary:stats(
                               Sock, <<>>,
                               fun (<<"ep_max_data_size">>, V, {_, Path}) ->
                                       {V, Path};
                                   (<<"ep_dbname">>, V, {S, _}) ->
                                       {S, V};
                                   (_, _, CD) ->
                                       CD
                               end, {missing_max_size, missing_path}),
    case ActualMaxSizeBin of
        MaxSizeBin ->
            ok;
        X1 when is_binary(X1) ->
            ?log_info("Changing max_size of ~p from ~s to ~s", [Bucket, X1,
                                                                MaxSizeBin]),
            mc_client_binary:set_flush_param(Sock, <<"max_size">>, MaxSizeBin)
    end,
    case ActualDBDirBin of
        DBDirBin ->
            ok;
        X2 when is_binary(X2) ->
            ?log_info("Changing dbname of ~p from ~s to ~s", [Bucket, X2,
                                                              DBDirBin]),
            %% Just exit; this will delete and recreate the bucket
            exit(normal)
    end;
ensure_bucket_config(Sock, _Bucket, memcached, _MaxSize) ->
    %% TODO: change max size of memcached bucket also
    %% Make sure it's a memcached bucket
    {ok, present} = mc_client_binary:stats(
                      Sock, <<>>,
                      fun (<<"evictions">>, _, _) ->
                              present;
                          (_, _, CD) ->
                              CD
                      end, not_present),
    ok.


server(Bucket) ->
    list_to_atom(?MODULE_STRING ++ "-" ++ Bucket).


wait_for_vbucket(Sock, VBucket, State, Callback) ->
    case mc_client_binary:get_vbucket(Sock, VBucket) of
        {ok, State} ->
            Callback(),
            true;
        {ok, _} ->
            timer:send_after(?VBUCKET_POLL_INTERVAL,
                             {wait_for_vbucket, VBucket, State, Callback}),
            false
    end.


wait_for_warmup(Sock) ->
    case mc_client_binary:stats(
           Sock, <<>>,
           fun (<<"ep_warmup_thread">>, V, _) ->
                   V;
               (_, _, CD) ->
                   CD
           end, missing_stat) of
        {ok, <<"complete">>} ->
            ok;
        {ok, missing_stat} -> % non-membase bucket
            ok;
        {ok, _} ->
            timer:sleep(1000),
            wait_for_warmup(Sock)
    end.
